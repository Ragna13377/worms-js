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
	private unsubscribers: (() => void)[];
	constructor(
		readonly client: LobbyClient,
		readonly config: OnlineConfig,
		readonly seat: Seat,
		recovering = false
	) {
		if (recovering) {
			this.status = 'restoringMatch';
			this.readySent = true;
		}
		this.simulation = createOnlineGame(config);
		this.unsubscribers = [
			client.onMessage((m) => this.receive(m)),
			client.subscribe((v) => {
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
		this.client.send({ type: 'MATCH_READY', matchId: this.config.matchId });
	}
	get owner(): Seat | null {
		return ownerOf(this.simulation.game);
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
		if (m.type === 'MATCH_SUSPENDED') {
			this.status = 'opponentDisconnected';
			this.credit = 0;
			this.replayGeneration++;
		}
		if (m.type === 'RECOVERY_BEGIN') {
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
			this.started = true;
			this.lastPeerAt = performance.now();
		}
		if (m.type === 'MATCH_STOP') {
			this.error = m.code;
			this.replayGeneration++;
		}
		if (m.type === 'INPUT_COMMIT') {
			if (this.status) return;
			try {
				this.timeline.enqueue(m);
			} catch (e) {
				this.fail(e instanceof Error ? e.message : 'BAD_SEQUENCE');
			}
		}
		if (m.type === 'PROGRESS') {
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
			this.client.send({
				type: 'RECOVERY_READY',
				matchId: this.config.matchId,
				recoveryId: recovery.recoveryId,
				targetTick: recovery.targetTick,
				hash: result.hash,
				turnIndex: result.simulation.game.match.turnIndex,
				ended: result.simulation.game.match.turnState === 'MATCH_END',
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
		this.client.send({
			type: 'INPUT_PROPOSE',
			matchId: this.config.matchId,
			clientSequence: ++this.clientSequence,
			clientTick: this.timeline.tick,
			turnIndex: this.simulation.game.match.turnIndex,
			change,
		});
	}
	neutralize() {
		this.propose({ moveDirection: 0, aimDirection: 0, commands: ['cancelCharge'] });
	}
	private checkpoint(id: string) {
		this.waiting = id;
		this.checkpointAt = performance.now();
		this.checkpointStatus = 'pending';
		this.checkpointHash = stateHash(
			this.simulation.game,
			this.simulation.world,
			this.timeline.tick
		);
		this.client.send({
			type: 'CHECKPOINT',
			matchId: this.config.matchId,
			checkpointId: id,
			logicalTick: this.timeline.tick,
			turnIndex: this.simulation.game.match.turnIndex,
			hash: this.checkpointHash,
		});
	}
	advance(delta: number) {
		if (this.error || this.status) return;
		const now = performance.now();
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
		if (!ended && now - this.lastProgress >= ONLINE.progressMs) {
			this.lastProgress = now;
			this.client.send({
				type: 'PROGRESS',
				matchId: this.config.matchId,
				logicalTick: this.timeline.tick,
			});
		}
		if (this.waiting) {
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
			steps < ONLINE.maxCatchUp && this.credit >= 1 && (ended || this.timeline.tick < this.horizon);
			steps++
		) {
			const turn = game.match.turnIndex,
				owner = this.owner;
			stepOnline(this.simulation, this.timeline);
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
		if (this.timeline.tick >= this.horizon && !ended)
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
			matchId: this.config.matchId,
		};
	}
	dispose() {
		this.disposed = true;
		this.replayGeneration++;
		for (const unsubscribe of this.unsubscribers) unsubscribe();
	}
}
