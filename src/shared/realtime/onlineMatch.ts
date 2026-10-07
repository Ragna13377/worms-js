import { WORLD_WIDTH_FACTOR } from '../../entities/World/model/world';
import { WORM } from '../../entities/Worm/model/config';
import { createMatchWorld } from '../../widgets/Gameplay/model/matchWorld';
import {
	activeWorm,
	advanceGame,
	createGame,
	type GameInput,
} from '../../widgets/Gameplay/model/simulation';
import { canControlWorm, canPrepareTurn } from '../../widgets/Gameplay/model/turns';
import type { LobbyClient } from './client';
import { InputTimeline } from './inputTimeline';
import { CommitMirror } from './mirror';
import { PeerLatency, type PeerMessage } from './peer';
import {
	type InputCommit,
	isRecoverableFailure,
	ONLINE,
	type OnlineConfig,
	type Seat,
	type ServerMessage,
} from './protocol';
import { stateHash } from './stateHash';

export function createOnlineGame(config: OnlineConfig) {
	const counts = { RED: config.roster, BLUE: config.roster, mode: { type: 'online' as const } };
	const world = createMatchWorld(
		config.worldWidth / WORLD_WIDTH_FACTOR,
		config.worldHeight,
		config.seed,
		counts
	);
	return { world, game: createGame(world, counts), mode: 'lobby' as const };
}
function ownerOf(game: ReturnType<typeof createGame>): Seat | null {
	if (!canControlWorm(game) && !canPrepareTurn(game)) return null;
	return activeWorm(game)?.team === 'RED' ? 'HOST' : 'GUEST';
}
/** Shared live/replay tick semantics; presentation never drives this simulation. */
export function stepOnline(
	simulation: ReturnType<typeof createOnlineGame>,
	timeline: InputTimeline
) {
	const { game, world } = simulation,
		turn = game.match.turnIndex,
		owner = ownerOf(game);
	advanceGame(game, world, timeline.consume(turn, owner), WORM.fixedStep);
	if (owner !== ownerOf(game) || turn !== game.match.turnIndex) timeline.neutralize();
}
export async function replayOnline(
	config: OnlineConfig,
	events: InputCommit[],
	targetTick: number,
	progress: (value: number) => void = () => {},
	cancelled: () => boolean = () => false
) {
	if (
		targetTick < 0 ||
		targetTick > ONLINE.maxMatchTicks ||
		events.length > ONLINE.maxHistoryEvents
	)
		throw new Error('RECOVERY_FAILED');
	const simulation = createOnlineGame(config),
		timeline = new InputTimeline();
	for (const e of events) {
		if (e.matchId !== config.matchId) throw new Error('INVALID_MATCH');
		timeline.enqueue(e);
	}
	while (timeline.tick < targetTick) {
		if (cancelled()) throw new Error('RECOVERY_CANCELLED');
		const end = Math.min(targetTick, timeline.tick + ONLINE.replayChunkTicks);
		while (timeline.tick < end) stepOnline(simulation, timeline);
		progress(Math.round((timeline.tick / Math.max(1, targetTick)) * 100));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}
	return { simulation, timeline, hash: stateHash(simulation.game, simulation.world, targetTick) };
}
export class OnlineMatch {
	simulation;
	timeline = new InputTimeline();
	status?: 'reconnecting' | 'opponentDisconnected' | 'restoringMatch' | 'resynchronizing';
	recoveryProgress = 0;
	reconnectDeadline?: number;
	onRestored?: () => void;
	private recovery?: Extract<ServerMessage, { type: 'RECOVERY_BEGIN' }>;
	private recoveryEvents: InputCommit[] = [];
	private replayGeneration = 0;
	private readySent = false;
	private disposed = false;
	started = false;
	error?: string;
	menuOpen = false;
	checkpointStatus = 'pending';
	checkpointHash = '';
	private waiting?: string;
	private checkpointAt = performance.now();
	private clientSequence = 0;
	private proposedMove = 0;
	private proposedAim = 0;
	private credit = 0;
	private horizon = ONLINE.maxLead as number;
	private lastProgress = -Infinity;
	private lastPeerAt = performance.now();
	private peerTick = 0;
	private direct = false;
	private authorSequencing = false;
	private peerSafeTick = 0;
	private advertisedSafeTick = 0;
	private lastEffectiveTick = 0;
	private lastMirror = -Infinity;
	private lastServerProgress = -Infinity;
	private flushing = false;
	private checkpointSent = false;
	private localInput?: { tick: number; at: number };
	private lastInputLatencyMs?: number;
	private mirror: CommitMirror;
	private unsubscribers: (() => void)[];
	constructor(
		readonly client: LobbyClient,
		readonly config: OnlineConfig,
		readonly seat: Seat,
		recovering = false
	) {
		this.mirror = new CommitMirror(config.matchId);
		if (recovering) {
			this.status = 'restoringMatch';
			this.readySent = true;
		}
		this.simulation = createOnlineGame(config);
		this.unsubscribers = [
			client.onPeerMessage((m) => this.receivePeer(m)),
			client.onMessage((m) => this.receive(m)),
			client.subscribe((v) => {
				if (this.direct && !this.status && v.transport === 'websocket-fallback')
					this.fail('PEER_TIMEOUT');
				if (
					(v.status === 'disconnected' || v.status === 'connecting') &&
					this.checkpointStatus !== 'ended'
				) {
					this.status = 'reconnecting';
					this.credit = 0;
					this.replayGeneration++;
				}
				if (v.error && v.error !== 'START_FORBIDDEN') this.fail(v.error);
			}),
		];
	}
	ready() {
		if (this.readySent) return;
		this.readySent = true;
		this.checkpoint('initial');
		const send = () =>
			this.client.send({
				type: 'MATCH_READY',
				matchId: this.config.matchId,
				...(this.client.peer || typeof window !== 'undefined'
					? { direct: this.client.peer?.state === 'p2p' }
					: {}),
			});
		if (this.client.peer) void this.client.peer.wait().then(send);
		else send();
	}
	get owner(): Seat | null {
		return ownerOf(this.simulation.game);
	}
	private get pacingOwner(): Seat {
		return this.simulation.game.match.turnIndex % 2 === 0 ? 'HOST' : 'GUEST';
	}
	get canSubmit() {
		return this.started && !this.error && !this.status && !this.waiting && this.owner === this.seat;
	}
	fail(code: string) {
		if (this.error) return;
		if (isRecoverableFailure(code)) {
			if (this.status || this.checkpointStatus === 'ended') return;
			this.status = 'resynchronizing';
			this.credit = 0;
			this.client.send({
				type: 'MATCH_FAIL',
				matchId: this.config.matchId,
				code,
			});
			return;
		}
		this.error = code;
		this.replayGeneration++;
		if (code === 'PREPARE_FAILED')
			this.client.send({
				type: 'MATCH_FAIL',
				matchId: this.config.matchId,
				code,
			});
	}
	private receive(m: ServerMessage) {
		if (!('matchId' in m) || m.matchId !== this.config.matchId) return;
		if (m.type === 'MIRROR_ACK') {
			this.mirror.ack(m.serverSequence);
			this.sendCheckpoint();
			if (this.flushing) this.flush();
		}
		if (m.type === 'RECOVERY_FLUSH') {
			this.status = 'restoringMatch';
			this.flushing = true;
			this.flush();
		}
		if (m.type === 'MATCH_SUSPENDED') {
			this.status = 'opponentDisconnected';
			this.reconnectDeadline = m.deadline;
			this.credit = 0;
			this.replayGeneration++;
		}
		if (m.type === 'RECOVERY_BEGIN') {
			this.flushing = false;
			this.mirror.ack(m.serverSequence);
			this.status = 'restoringMatch';
			this.recoveryProgress = 0;
			this.credit = 0;
			this.recovery = m;
			this.recoveryEvents = [];
			this.replayGeneration++;
		}
		if (m.type === 'RECOVERY_LOG' && m.recoveryId === this.recovery?.recoveryId) {
			if (
				m.offset !== this.recoveryEvents.length ||
				m.offset + m.events.length > this.recovery.eventCount
			) {
				this.fail('RECOVERY_FAILED');
				return;
			}
			this.recoveryEvents.push(...m.events);
		}
		if (m.type === 'RECOVERY_REPLAY' && m.recoveryId === this.recovery?.recoveryId)
			void this.restore();
		if (m.type === 'RECOVERY_GO' && m.recoveryId === this.recovery?.recoveryId) {
			this.direct = !!m.direct;
			this.authorSequencing = m.direct !== undefined;
			this.peerSafeTick = this.advertisedSafeTick = m.targetTick;
			this.lastEffectiveTick = this.recoveryEvents.at(-1)?.effectiveTick ?? m.targetTick;
			if (this.timeline.tick !== m.targetTick) {
				this.fail('RECOVERY_FAILED');
				return;
			}
			this.status = undefined;
			this.started = true;
			this.waiting = undefined;
			this.checkpointStatus = m.ended ? 'ended' : 'OK';
			this.credit = 0;
			this.horizon = m.targetTick + ONLINE.maxLead;
			this.peerTick = m.targetTick;
			this.lastProgress = -Infinity;
			this.lastPeerAt = performance.now();
			this.proposedMove = this.proposedAim = Number.NaN;
		}
		if (m.type === 'MATCH_GO') {
			this.direct = !!m.direct;
			this.authorSequencing = m.direct !== undefined;
			this.started = true;
			this.lastPeerAt = performance.now();
		}
		if (m.type === 'MATCH_STOP') {
			this.error = m.code;
			this.replayGeneration++;
		}
		if (m.type === 'INPUT_COMMIT') {
			if (this.direct) return;
			if (this.authorSequencing) {
				if (m.seat !== this.seat) this.receivePeer(m);
				return;
			}
			if (this.status) return;
			try {
				this.timeline.enqueue(m);
			} catch (e) {
				this.fail(e instanceof Error ? e.message : 'BAD_SEQUENCE');
			}
		}
		if (m.type === 'PROGRESS') {
			if (this.authorSequencing) return;
			this.horizon = Math.min(m.hostTick, m.guestTick) + ONLINE.maxLead;
			const tick = this.seat === 'HOST' ? m.guestTick : m.hostTick;
			if (tick !== this.peerTick) {
				this.peerTick = tick;
				this.lastPeerAt = performance.now();
			}
		}
		if (m.type === 'CHECKPOINT_OK' && m.checkpointId === this.waiting) {
			if (m.logicalTick !== this.timeline.tick || m.hash !== this.checkpointHash) {
				this.fail('DESYNC');
				return;
			}
			this.waiting = undefined;
			this.checkpointStatus = m.checkpointId === 'end' ? 'ended' : 'OK';
			this.credit = 0;
			this.lastPeerAt = performance.now();
		}
		if (m.type === 'PEER_PROGRESS' && !this.direct && m.from !== this.seat) {
			const { from: _from, ...progress } = m;
			this.receivePeer(progress);
		}
	}
	get delayTicks() {
		if (this.direct) return this.client.peer?.latency.delayTicks ?? 2;
		const latency = new PeerLatency();
		// A fallback commit travels to DO and back before delivery to simulation.
		latency.observe(2 * (this.client.snapshot.serverPing ?? 50));
		return latency.delayTicks;
	}
	private receivePeer(m: PeerMessage) {
		if (
			!this.authorSequencing ||
			this.status ||
			!('matchId' in m) ||
			m.matchId !== this.config.matchId
		)
			return;
		if (m.type === 'INPUT_COMMIT') {
			if (
				m.seat === this.seat ||
				m.seat !== (m.turnIndex % 2 === 0 ? 'HOST' : 'GUEST') ||
				m.turnIndex !== this.simulation.game.match.turnIndex
			) {
				this.fail('BAD_SEQUENCE');
				return;
			}
			try {
				this.mirror.retain(m);
				this.timeline.enqueue(m);
				this.lastEffectiveTick = m.effectiveTick;
			} catch (e) {
				this.fail(e instanceof Error ? e.message : 'BAD_SEQUENCE');
			}
		}
		if (m.type === 'PEER_PROGRESS') {
			if (
				m.sequence > this.timeline.lastSequence ||
				m.tick < this.peerTick ||
				m.safeTick < m.tick ||
				m.safeTick > m.tick + 180
			) {
				this.fail('BAD_SEQUENCE');
				return;
			}
			this.peerTick = m.tick;
			this.lastPeerAt = performance.now();
			if (this.pacingOwner !== this.seat && m.turnIndex === this.simulation.game.match.turnIndex)
				this.peerSafeTick = Math.max(this.peerSafeTick, m.safeTick);
			// A peer that already crossed a boundary has closed the previous turn's
			// input stream. Let the follower reach that exact boundary even when a
			// catch-up batch crossed it beyond the preceding progress watermark.
			if (m.turnIndex === this.simulation.game.match.turnIndex + 1)
				this.peerSafeTick = Math.max(this.peerSafeTick, m.tick);
			this.horizon =
				this.peerTick +
				(this.direct
					? ONLINE.maxLead
					: Math.max(
							ONLINE.maxLead,
							this.delayTicks * 2 + Math.ceil(ONLINE.progressMs / (1000 / 60))
						));
		}
	}
	private flush() {
		for (const commit of this.mirror.tail)
			this.client.send({ type: 'INPUT_MIRROR', matchId: this.config.matchId, commit });
		this.client.send({
			type: 'FLUSH_READY',
			matchId: this.config.matchId,
			serverSequence: Math.max(this.timeline.lastSequence, this.mirror.lastSequence),
		});
	}
	private async restore() {
		const recovery = this.recovery,
			generation = ++this.replayGeneration;
		if (!recovery || this.recoveryEvents.length !== recovery.eventCount) {
			this.fail('RECOVERY_FAILED');
			return;
		}
		try {
			const result = await replayOnline(
				this.config,
				this.recoveryEvents,
				recovery.targetTick,
				(p) => {
					this.recoveryProgress = p;
				},
				() => this.disposed || generation !== this.replayGeneration
			);
			if (this.disposed || generation !== this.replayGeneration) return;
			if (result.timeline.lastSequence !== recovery.serverSequence) throw new Error('BAD_SEQUENCE');
			this.simulation = result.simulation;
			this.timeline = result.timeline;
			this.clientSequence = recovery.clientSequences[this.seat];
			// Force a fresh axes proposal: a refreshed tab has no held keyboard state.
			this.proposedMove = this.proposedAim = Number.NaN;
			this.checkpointHash = result.hash;
			this.onRestored?.();
			await this.client.peer?.wait();
			if (generation !== this.replayGeneration || this.disposed) return;
			this.client.send({
				type: 'RECOVERY_READY',
				matchId: this.config.matchId,
				recoveryId: recovery.recoveryId,
				targetTick: recovery.targetTick,
				hash: result.hash,
				turnIndex: result.simulation.game.match.turnIndex,
				ended: result.simulation.game.match.turnState === 'MATCH_END',
				...(this.client.peer || typeof window !== 'undefined'
					? { direct: this.client.peer?.state === 'p2p' }
					: {}),
			});
		} catch {
			if (generation !== this.replayGeneration || this.disposed) return;
			this.fail('RECOVERY_FAILED');
			this.client.send({
				type: 'MATCH_FAIL',
				matchId: this.config.matchId,
				code: 'PREPARE_FAILED',
			});
		}
	}
	propose(input: GameInput) {
		if (!this.canSubmit) {
			this.proposedMove = this.proposedAim = 0;
			return;
		}
		const move = input.moveDirection,
			aim = input.aimDirection ?? 0;
		if (move === this.proposedMove && aim === this.proposedAim && !input.commands.length) return;
		const change = {
			...(move !== this.proposedMove ? { moveDirection: move } : {}),
			...(aim !== this.proposedAim ? { aimDirection: aim } : {}),
			commands: input.commands,
		};
		this.proposedMove = move;
		this.proposedAim = aim;
		if (this.authorSequencing) {
			const commit: InputCommit = {
				type: 'INPUT_COMMIT',
				matchId: this.config.matchId,
				seat: this.seat,
				turnIndex: this.simulation.game.match.turnIndex,
				serverSequence: this.timeline.lastSequence + 1,
				effectiveTick: Math.max(
					this.timeline.tick + this.delayTicks,
					this.lastEffectiveTick,
					this.advertisedSafeTick
				),
				change,
			};
			try {
				this.mirror.retain(commit);
				this.timeline.enqueue(commit);
				this.localInput = { tick: commit.effectiveTick, at: performance.now() };
				this.lastEffectiveTick = commit.effectiveTick;
				this.client.send({ type: 'INPUT_MIRROR', matchId: this.config.matchId, commit });
				if (this.direct && !this.client.peer?.send(commit)) this.fail('PEER_TIMEOUT');
			} catch (e) {
				this.fail(e instanceof Error ? e.message : 'BAD_SEQUENCE');
			}
			return;
		}
		this.client.send({
			type: 'INPUT_PROPOSE',
			matchId: this.config.matchId,
			clientSequence: ++this.clientSequence,
			clientTick: this.timeline.tick,
			turnIndex: this.simulation.game.match.turnIndex,
			change,
			delayTicks: this.delayTicks,
		});
	}
	neutralize() {
		this.propose({ moveDirection: 0, aimDirection: 0, commands: ['cancelCharge'] });
	}
	private checkpoint(id: string) {
		this.waiting = id;
		this.checkpointAt = performance.now();
		this.checkpointStatus = 'pending';
		this.checkpointSent = false;
		this.checkpointHash = stateHash(
			this.simulation.game,
			this.simulation.world,
			this.timeline.tick
		);
		this.sendCheckpoint();
	}
	private sendCheckpoint() {
		if (
			!this.waiting ||
			this.checkpointSent ||
			(this.authorSequencing && this.mirror.persistedSequence < this.timeline.lastSequence)
		)
			return;
		this.checkpointSent = true;
		this.client.send({
			type: 'CHECKPOINT',
			matchId: this.config.matchId,
			checkpointId: this.waiting,
			logicalTick: this.timeline.tick,
			turnIndex: this.simulation.game.match.turnIndex,
			hash: this.checkpointHash,
		});
	}
	private publishProgress(now: number) {
		if (
			!this.authorSequencing ||
			now - this.lastProgress < (this.direct ? 1000 / 60 : ONLINE.progressMs)
		)
			return;
		this.lastProgress = now;
		const safeTick = Math.max(this.timeline.tick + this.delayTicks, this.advertisedSafeTick);
		this.advertisedSafeTick = safeTick;
		const progress = {
			type: 'PEER_PROGRESS' as const,
			matchId: this.config.matchId,
			tick: this.timeline.tick,
			safeTick,
			turnIndex: this.simulation.game.match.turnIndex,
			sequence: this.timeline.lastSequence,
		};
		if (this.direct) this.client.peer?.send(progress);
		else this.client.send(progress);
	}
	advance(delta: number) {
		if (this.error || this.status) return;
		const now = performance.now();
		if (this.authorSequencing && now - this.lastMirror >= 500) {
			this.lastMirror = now;
			for (const commit of this.mirror.tail)
				if (commit.seat === this.seat)
					this.client.send({ type: 'INPUT_MIRROR', matchId: this.config.matchId, commit });
		}
		if (this.waiting && now - this.checkpointAt > ONLINE.peerTimeoutMs) {
			this.fail('PEER_TIMEOUT');
			return;
		}
		if (!this.started) return;
		const ended = this.simulation.game.match.turnState === 'MATCH_END';
		if ((!ended || this.waiting) && now - this.lastPeerAt > ONLINE.peerTimeoutMs) {
			this.fail('PEER_TIMEOUT');
			return;
		}
		if (
			!ended &&
			(!this.authorSequencing || this.direct) &&
			now - this.lastServerProgress >= (this.direct ? 1000 : ONLINE.progressMs)
		) {
			this.lastServerProgress = now;
			this.client.send({
				type: 'PROGRESS',
				matchId: this.config.matchId,
				logicalTick: this.timeline.tick,
			});
		}
		if (this.waiting) {
			this.publishProgress(now);
			this.credit = 0;
			return;
		}
		this.credit += Math.max(0, delta) / WORM.fixedStep;
		if (this.credit > ONLINE.maxBehind && this.checkpointStatus !== 'ended') {
			this.fail('SIMULATION_BEHIND');
			return;
		}
		if (this.checkpointStatus === 'ended') this.credit = Math.min(this.credit, ONLINE.maxCatchUp);
		const { game } = this.simulation;
		for (
			let steps = 0;
			steps < ONLINE.maxCatchUp &&
			this.credit >= 1 &&
			(ended ||
				(this.timeline.tick < this.horizon &&
					(!this.authorSequencing ||
						this.pacingOwner === this.seat ||
						this.timeline.tick < this.peerSafeTick)));
			steps++
		) {
			const turn = game.match.turnIndex,
				owner = this.owner;
			stepOnline(this.simulation, this.timeline);
			if (this.localInput && this.timeline.tick > this.localInput.tick) {
				this.lastInputLatencyMs = performance.now() - this.localInput.at;
				this.localInput = undefined;
			}
			this.credit--;
			if (owner !== this.owner || turn !== game.match.turnIndex) {
				this.timeline.neutralize();
				this.proposedMove = this.proposedAim = 0;
			}
			if (!ended && game.match.turnState === 'MATCH_END') {
				this.checkpoint('end');
				break;
			}
			if (turn !== game.match.turnIndex) {
				this.checkpoint(`turn-${game.match.turnIndex}`);
				break;
			}
		}
		// Network pacing stalls consume wall-clock credit, never gameplay ticks.
		if (!ended) this.publishProgress(now);
		if (
			!ended &&
			(this.timeline.tick >= this.horizon ||
				(this.authorSequencing &&
					this.pacingOwner !== this.seat &&
					this.timeline.tick >= this.peerSafeTick))
		)
			this.credit = Math.min(this.credit, ONLINE.maxCatchUp);
	}
	diagnostics() {
		return {
			tick: this.timeline.tick,
			seat: this.seat,
			lastSequence: this.timeline.lastSequence,
			queued: this.timeline.queued,
			checkpoint: this.checkpointStatus,
			hash: this.checkpointHash,
			error: this.error,
			status: this.status,
			recoveryProgress: this.recoveryProgress,
			ping: this.client.snapshot.ping,
			transport: this.direct ? 'p2p' : 'websocket-fallback',
			peerPing: this.client.snapshot.peerPing,
			serverPing: this.client.snapshot.serverPing,
			delayTicks: this.delayTicks,
			delayMs: (this.delayTicks * 1000) / 60,
			persistedSequence: this.mirror.persistedSequence,
			lastInputLatencyMs: this.lastInputLatencyMs,
			matchId: this.config.matchId,
		};
	}
	dispose() {
		this.disposed = true;
		this.replayGeneration++;
		for (const unsubscribe of this.unsubscribers) unsubscribe();
	}
}
