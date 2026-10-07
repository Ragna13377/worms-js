import {
	type Checkpoint,
	type ClientMessage,
	type InputCommit,
	ONLINE,
	type OnlineConfig,
	type Seat,
	type ServerMessage,
} from '../../src/shared/realtime/protocol';

export type Coordinator = {
	config: OnlineConfig;
	phase: 'preparing' | 'playing' | 'suspended' | 'recovering' | 'ended' | 'stopped';
	ready: Seat[];
	ticks: Record<Seat, number>;
	clientSequences: Record<Seat, number>;
	serverSequence: number;
	lastScheduled: number;
	turnIndex: number;
	checkpoints: Partial<Record<Seat, Checkpoint>>;
	history: InputCommit[];
	recoveryId: number;
	recoveryAttempts: number;
	recoveries: number;
	deadline?: number;
	targetTick: number;
	verifiedTick: number;
	recoveryReady: Partial<Record<Seat, Extract<ClientMessage, { type: 'RECOVERY_READY' }>>>;
	direct?: boolean;
	authorSequencing?: boolean;
	sequencedReady?: Partial<Record<Seat, boolean>>;
	directReady?: Partial<Record<Seat, boolean>>;
	flushReady?: Partial<Record<Seat, number>>;
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
		history: [],
		recoveryId: 0,
		recoveryAttempts: 0,
		recoveries: 0,
		targetTick: 0,
		verifiedTick: 0,
		recoveryReady: {},
	};
}
export function stopMatch(match: Coordinator, code: string): ServerMessage[] {
	match.phase = 'stopped';
	delete match.deadline;
	match.history = [];
	match.recoveryReady = {};
	return [{ type: 'MATCH_STOP', matchId: match.config.matchId, code }];
}
export function suspendMatch(
	match: Coordinator,
	reason: string,
	now = Date.now()
): ServerMessage[] {
	if (['ended', 'stopped'].includes(match.phase)) return [];
	// Repeated disconnect callbacks cannot extend the grace period.
	match.deadline ??= now + ONLINE.reconnectGraceMs;
	match.phase = 'suspended';
	match.recoveryReady = {};
	return [
		{ type: 'MATCH_SUSPENDED', matchId: match.config.matchId, reason, deadline: match.deadline },
	];
}
export function beginRecovery(
	match: Coordinator,
	retry = false,
	now = Date.now(),
	drained = false
): ServerMessage[] {
	if (['ended', 'stopped'].includes(match.phase)) return [];
	if ((match.direct || match.authorSequencing) && !retry && !drained) {
		match.phase = 'suspended';
		match.deadline ??= now + ONLINE.reconnectGraceMs;
		match.flushReady = {};
		return [{ type: 'RECOVERY_FLUSH', matchId: match.config.matchId }];
	}
	if (!retry) {
		match.recoveryAttempts = 0;
		if (++match.recoveries > ONLINE.maxRecoveries) return stopMatch(match, 'RECOVERY_FAILED');
	}
	if (++match.recoveryAttempts > ONLINE.maxRecoveryAttempts) return stopMatch(match, 'DESYNC');
	if (!retry)
		match.targetTick = Math.max(
			match.verifiedTick,
			match.ticks.HOST,
			match.ticks.GUEST,
			...Object.values(match.checkpoints).map((c) => c.logicalTick)
		);
	if (match.targetTick > ONLINE.maxMatchTicks) return stopMatch(match, 'RECOVERY_FAILED');
	match.phase = 'recovering';
	match.deadline = now + ONLINE.recoveryTimeoutMs;
	match.recoveryReady = {};
	match.checkpoints = {};
	const matchId = match.config.matchId,
		recoveryId = ++match.recoveryId;
	const messages: ServerMessage[] = [
		{
			type: 'RECOVERY_BEGIN',
			matchId,
			recoveryId,
			targetTick: match.targetTick,
			serverSequence: match.serverSequence,
			clientSequences: { ...match.clientSequences },
			eventCount: match.history.length,
		},
	];
	for (let offset = 0; offset < match.history.length; offset += ONLINE.recoveryChunkEvents)
		messages.push({
			type: 'RECOVERY_LOG',
			matchId,
			recoveryId,
			offset,
			events: match.history.slice(offset, offset + ONLINE.recoveryChunkEvents),
		});
	messages.push({ type: 'RECOVERY_REPLAY', matchId, recoveryId });
	return messages;
}
export function recoveryTimeout(match: Coordinator, now = Date.now()): ServerMessage[] {
	return match.deadline !== undefined && now >= match.deadline
		? stopMatch(match, match.phase === 'suspended' ? 'OPPONENT_DISCONNECTED' : 'RECOVERY_FAILED')
		: [];
}
/** Coordination only: this module never imports or advances the gameplay engine. */
export function coordinate(match: Coordinator, seat: Seat, m: ClientMessage): ServerMessage[] {
	if (!('matchId' in m) || m.matchId !== match.config.matchId) throw new Error('INVALID_MATCH');
	if (m.type === 'INPUT_MIRROR') {
		const c = m.commit;
		const ack = {
			type: 'MIRROR_ACK' as const,
			matchId: m.matchId,
			serverSequence: match.serverSequence,
		};
		if ((!match.direct && !match.authorSequencing) || ['ended', 'stopped'].includes(match.phase))
			throw new Error('INPUT_FORBIDDEN');
		if (c.serverSequence <= match.serverSequence) {
			if (JSON.stringify(match.history[c.serverSequence - 1]) !== JSON.stringify(c))
				throw new Error('BAD_SEQUENCE');
			return [ack];
		}
		// A gap is never acknowledged; both peers retry their retained tail in order.
		if (c.serverSequence !== match.serverSequence + 1) return [ack];
		// During normal play only the authenticated author can persist new input.
		// A surviving opposite seat can resend its retained copy at the recovery barrier.
		if (seat !== c.seat && match.phase !== 'suspended') throw new Error('INPUT_FORBIDDEN');
		if (
			match.phase === 'recovering' ||
			c.turnIndex !== match.turnIndex ||
			c.seat !== (match.turnIndex % 2 === 0 ? 'HOST' : 'GUEST') ||
			c.effectiveTick < match.lastScheduled ||
			c.effectiveTick > Math.max(match.ticks.HOST, match.ticks.GUEST) + 180
		)
			throw new Error('INPUT_FORBIDDEN');
		if (match.history.length >= ONLINE.maxHistoryEvents)
			return stopMatch(match, 'INPUT_RATE_LIMIT');
		match.serverSequence = c.serverSequence;
		match.lastScheduled = c.effectiveTick;
		match.history.push(c);
		return [{ ...ack, serverSequence: match.serverSequence }, ...(!match.direct ? [c] : [])];
	}
	if (m.type === 'FLUSH_READY') {
		if (!match.flushReady) return [];
		match.flushReady[seat] = m.serverSequence;
		const a = match.flushReady.HOST,
			b = match.flushReady.GUEST;
		if (a === undefined || b === undefined || match.serverSequence < Math.max(a, b)) return [];
		delete match.flushReady;
		return beginRecovery(match, false, Date.now(), true);
	}
	if (m.type === 'MATCH_FAIL') {
		if (['ended', 'stopped'].includes(match.phase)) return [];
		if (m.code === 'PREPARE_FAILED') return stopMatch(match, 'RECOVERY_FAILED');
		if (['suspended', 'recovering'].includes(match.phase)) return [];
		return beginRecovery(match);
	}
	if (m.type === 'RECOVERY_READY') {
		if (
			match.phase !== 'recovering' ||
			m.recoveryId !== match.recoveryId ||
			m.targetTick !== match.targetTick
		)
			return [];
		match.recoveryReady[seat] = m;
		const a = match.recoveryReady.HOST,
			b = match.recoveryReady.GUEST;
		if (!a || !b) return [];
		if (
			a.hash !== b.hash ||
			a.turnIndex !== b.turnIndex ||
			a.ended !== b.ended ||
			a.turnIndex < match.turnIndex ||
			a.turnIndex > match.turnIndex + 1
		)
			return beginRecovery(match, true);
		match.turnIndex = a.turnIndex;
		match.direct = !!a.direct && !!b.direct;
		match.authorSequencing = a.direct !== undefined && b.direct !== undefined;
		match.verifiedTick = match.targetTick;
		match.ticks = { HOST: match.targetTick, GUEST: match.targetTick };
		match.phase = a.ended ? 'ended' : 'playing';
		delete match.deadline;
		match.recoveryReady = {};
		return [
			{
				type: 'RECOVERY_GO',
				matchId: m.matchId,
				recoveryId: match.recoveryId,
				targetTick: match.targetTick,
				ended: a.ended,
				...(match.authorSequencing ? { direct: match.direct } : {}),
			},
		];
	}
	// In-flight messages from the previous connection/barrier are harmless.
	if (match.phase === 'suspended' || match.phase === 'recovering') return [];
	if (m.type === 'MATCH_READY' && match.phase === 'preparing') {
		match.directReady ??= {};
		match.directReady[seat] = !!m.direct;
		match.sequencedReady ??= {};
		match.sequencedReady[seat] = m.direct !== undefined;
		if (!match.ready.includes(seat)) match.ready.push(seat);
		if (match.ready.length === 2) {
			match.phase = 'playing';
			match.direct = !!match.directReady.HOST && !!match.directReady.GUEST;
			match.authorSequencing = !!match.sequencedReady.HOST && !!match.sequencedReady.GUEST;
			return [
				{
					type: 'MATCH_GO',
					matchId: m.matchId,
					...(match.authorSequencing ? { direct: match.direct } : {}),
				},
			];
		}
		return [];
	}
	if (match.phase !== 'playing' && !(match.phase === 'preparing' && m.type === 'CHECKPOINT'))
		throw new Error('MATCH_NOT_PLAYING');
	if (m.type === 'PROGRESS') {
		if (
			m.logicalTick > ONLINE.maxMatchTicks ||
			m.logicalTick < match.ticks[seat] ||
			m.logicalTick > match.ticks[seat] + 120
		)
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
	if (m.type === 'PEER_PROGRESS') {
		if (
			!match.authorSequencing ||
			match.direct ||
			m.tick > ONLINE.maxMatchTicks ||
			m.tick < match.ticks[seat] ||
			m.tick > match.ticks[seat] + 120 ||
			m.sequence > match.serverSequence
		)
			throw new Error('INVALID_PROGRESS');
		match.ticks[seat] = m.tick;
		return [{ ...m, from: seat }];
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
		const effectiveTick = Math.max(
			Math.max(m.clientTick, match.ticks.HOST, match.ticks.GUEST) +
				(m.delayTicks ?? ONLINE.inputDelay),
			match.lastScheduled
		);
		if (effectiveTick > Math.max(match.ticks.HOST, match.ticks.GUEST) + 180)
			throw new Error('INPUT_RATE_LIMIT');
		if (match.history.length >= ONLINE.maxHistoryEvents || effectiveTick > ONLINE.maxMatchTicks)
			return stopMatch(match, 'INPUT_RATE_LIMIT');
		match.clientSequences[seat] = m.clientSequence;
		match.lastScheduled = effectiveTick;
		const commit: InputCommit = {
			type: 'INPUT_COMMIT',
			matchId: m.matchId,
			seat,
			turnIndex: m.turnIndex,
			serverSequence: ++match.serverSequence,
			effectiveTick,
			change: m.change,
		};
		match.history.push(commit);
		return [commit];
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
		if (
			a.checkpointId !== b.checkpointId ||
			a.logicalTick !== b.logicalTick ||
			a.turnIndex !== b.turnIndex ||
			a.hash !== b.hash
		) {
			return beginRecovery(match);
		}
		match.checkpoints = {};
		match.turnIndex = a.turnIndex;
		match.verifiedTick = a.logicalTick;
		if (a.checkpointId === 'end') match.phase = 'ended';
		return [{ ...a, type: 'CHECKPOINT_OK' }];
	}
	throw new Error('INVALID_MESSAGE');
}
