import {
	type Checkpoint,
	type ClientMessage,
	ONLINE,
	type OnlineConfig,
	type Seat,
	type ServerMessage,
} from '../../src/shared/realtime/protocol';

export type Coordinator = {
	config: OnlineConfig;
	phase: 'preparing' | 'playing' | 'ended' | 'stopped';
	ready: Seat[];
	ticks: Record<Seat, number>;
	clientSequences: Record<Seat, number>;
	serverSequence: number;
	lastScheduled: number;
	turnIndex: number;
	checkpoints: Partial<Record<Seat, Checkpoint>>;
};
export function prepareMatch(roster: number): Coordinator {
	return {
		config: {
			matchId: crypto.randomUUID(),
			seed: crypto.getRandomValues(new Uint32Array(1))[0],
			roster,
			worldWidth: ONLINE.worldWidth,
			worldHeight: ONLINE.worldHeight,
		},
		phase: 'preparing',
		ready: [],
		ticks: { HOST: 0, GUEST: 0 },
		clientSequences: { HOST: 0, GUEST: 0 },
		serverSequence: 0,
		lastScheduled: 0,
		turnIndex: 0,
		checkpoints: {},
	};
}
/** Coordination only: this module never imports or advances the gameplay engine. */
export function coordinate(match: Coordinator, seat: Seat, m: ClientMessage): ServerMessage[] {
	if (!('matchId' in m) || m.matchId !== match.config.matchId) throw new Error('INVALID_MATCH');
	if (m.type === 'MATCH_FAIL') {
		match.phase = 'stopped';
		return [{ type: 'MATCH_STOP', matchId: m.matchId, code: m.code }];
	}
	if (m.type === 'MATCH_READY' && match.phase === 'preparing') {
		if (!match.ready.includes(seat)) match.ready.push(seat);
		if (match.ready.length === 2) {
			match.phase = 'playing';
			return [{ type: 'MATCH_GO', matchId: m.matchId }];
		}
		return [];
	}
	if (match.phase !== 'playing' && !(match.phase === 'preparing' && m.type === 'CHECKPOINT'))
		throw new Error('MATCH_NOT_PLAYING');
	if (m.type === 'PROGRESS') {
		if (m.logicalTick < match.ticks[seat] || m.logicalTick > match.ticks[seat] + 120)
			throw new Error('INVALID_PROGRESS');
		match.ticks[seat] = m.logicalTick;
		return [
			{
				type: 'PROGRESS',
				matchId: m.matchId,
				hostTick: match.ticks.HOST,
				guestTick: match.ticks.GUEST,
			},
		];
	}
	if (m.type === 'INPUT_PROPOSE') {
		if (
			m.clientSequence !== match.clientSequences[seat] + 1 ||
			m.turnIndex !== match.turnIndex ||
			seat !== (m.turnIndex % 2 === 0 ? 'HOST' : 'GUEST') ||
			m.clientTick < match.ticks[seat] ||
			m.clientTick > match.ticks[seat] + 120
		)
			throw new Error('INPUT_FORBIDDEN');
		match.clientSequences[seat] = m.clientSequence;
		const effectiveTick =
			Math.max(m.clientTick, match.ticks.HOST, match.ticks.GUEST, match.lastScheduled) +
			ONLINE.inputDelay;
		if (effectiveTick > Math.max(match.ticks.HOST, match.ticks.GUEST) + 180)
			throw new Error('INPUT_RATE_LIMIT');
		match.lastScheduled = effectiveTick;
		return [
			{
				type: 'INPUT_COMMIT',
				matchId: m.matchId,
				seat,
				turnIndex: m.turnIndex,
				serverSequence: ++match.serverSequence,
				effectiveTick,
				change: m.change,
			},
		];
	}
	if (m.type === 'CHECKPOINT') {
		const expected =
			m.checkpointId === 'initial'
				? 0
				: m.checkpointId === 'end'
					? match.turnIndex
					: match.turnIndex + 1;
		if (
			m.turnIndex !== expected ||
			(m.checkpointId !== 'initial' &&
				m.checkpointId !== 'end' &&
				m.checkpointId !== `turn-${expected}`)
		)
			throw new Error('INVALID_CHECKPOINT');
		if (match.checkpoints[seat]) throw new Error('DUPLICATE_CHECKPOINT');
		match.checkpoints[seat] = m;
		const a = match.checkpoints.HOST,
			b = match.checkpoints.GUEST;
		if (!a || !b) return [];
		match.checkpoints = {};
		if (
			a.checkpointId !== b.checkpointId ||
			a.logicalTick !== b.logicalTick ||
			a.turnIndex !== b.turnIndex ||
			a.hash !== b.hash
		) {
			match.phase = 'stopped';
			return [{ type: 'MATCH_STOP', matchId: m.matchId, code: 'DESYNC' }];
		}
		match.turnIndex = a.turnIndex;
		if (a.checkpointId === 'end') match.phase = 'ended';
		return [{ ...a, type: 'CHECKPOINT_OK' }];
	}
	throw new Error('INVALID_MESSAGE');
}
