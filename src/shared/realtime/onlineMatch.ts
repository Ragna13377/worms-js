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
import { ONLINE, type OnlineConfig, type Seat, type ServerMessage } from './protocol';
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
export class OnlineMatch {
	readonly simulation;
	readonly timeline = new InputTimeline();
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
		readonly seat: Seat
	) {
		this.simulation = createOnlineGame(config);
		this.unsubscribers = [
			client.onMessage((m) => this.receive(m)),
			client.subscribe((v) => {
				if (v.status === 'disconnected') this.fail('CONNECTION_LOST');
				if (v.error) this.fail(v.error);
			}),
		];
	}
	ready() {
		this.checkpoint('initial');
		this.client.send({ type: 'MATCH_READY', matchId: this.config.matchId });
	}
	get owner(): Seat | null {
		const game = this.simulation.game;
		if (!canControlWorm(game) && !canPrepareTurn(game)) return null;
		return activeWorm(game)?.team === 'RED' ? 'HOST' : 'GUEST';
	}
	get canSubmit() {
		return this.started && !this.error && !this.waiting && this.owner === this.seat;
	}
	fail(code: string) {
		if (this.error) return;
		this.error = code;
		if (
			[
				'LATE_INPUT',
				'BAD_SEQUENCE',
				'SIMULATION_BEHIND',
				'PEER_TIMEOUT',
				'PREPARE_FAILED',
			].includes(code)
		)
			this.client.send({
				type: 'MATCH_FAIL',
				matchId: this.config.matchId,
				code: code as 'LATE_INPUT',
			});
	}
	private receive(m: ServerMessage) {
		if (!('matchId' in m) || m.matchId !== this.config.matchId) return;
		if (m.type === 'MATCH_GO') {
			this.started = true;
			this.lastPeerAt = performance.now();
		}
		if (m.type === 'MATCH_STOP') this.fail(m.code);
		if (m.type === 'INPUT_COMMIT') {
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
			this.checkpointStatus = 'OK';
			this.credit = 0;
			this.lastPeerAt = performance.now();
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
		if (this.error) return;
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
		if (this.credit > ONLINE.maxBehind) {
			this.fail('SIMULATION_BEHIND');
			return;
		}
		const { game, world } = this.simulation;
		for (
			let steps = 0;
			steps < ONLINE.maxCatchUp && this.credit >= 1 && (ended || this.timeline.tick < this.horizon);
			steps++
		) {
			const turn = game.match.turnIndex,
				owner = this.owner;
			advanceGame(game, world, this.timeline.consume(turn, owner), WORM.fixedStep);
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
			matchId: this.config.matchId,
		};
	}
	dispose() {
		for (const unsubscribe of this.unsubscribers) unsubscribe();
	}
}
