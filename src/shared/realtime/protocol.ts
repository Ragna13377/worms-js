export type Seat = 'HOST' | 'GUEST';
export type RoomState = {
	roster?: number;
	matchStarted?: boolean;
	roomId: string;
	hostConnected: boolean;
	guestConnected: boolean;
	full: boolean;
	ready: boolean;
	expiresAt: number;
};
export type RoomCredential = { roomId: string; token: string; seat: Seat };
export type ServerMessage =
	| MatchServerMessage
	| (SignalMessage & { from: Seat })
	| { type: 'PONG'; id: number }
	| { type: 'CONNECTED'; seat: Seat }
	| { type: 'ROOM_STATE'; state: RoomState }
	| { type: 'PLAYER_JOINED' | 'PLAYER_LEFT'; seat: Seat }
	| { type: 'PEER_MESSAGE'; from: Seat; value: string }
	| { type: 'ERROR'; code: string };
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_ID_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const MAX_MESSAGE_BYTES = 1024;
export const MAX_SIGNAL_BYTES = 16384;
export type IceCandidate = {
	candidate?: string;
	sdpMid?: string | null;
	sdpMLineIndex?: number | null;
	usernameFragment?: string | null;
};
export type SignalMessage = {
	type: 'SIGNAL';
	connectionId: string;
	signal: { kind: 'offer' | 'answer'; sdp: string } | { kind: 'ice'; candidate: IceCandidate };
};
export function parseSignalMessage(raw: string): SignalMessage | null {
	if (new TextEncoder().encode(raw).byteLength > MAX_SIGNAL_BYTES) return null;
	try {
		const m = JSON.parse(raw);
		if (
			!m ||
			typeof m !== 'object' ||
			!exact(m, ['type', 'connectionId', 'signal']) ||
			m.type !== 'SIGNAL' ||
			typeof m.connectionId !== 'string' ||
			!/^[a-f0-9-]{36}$/.test(m.connectionId)
		)
			return null;
		const s = m.signal;
		if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
		if (s.kind === 'offer' || s.kind === 'answer')
			return exact(s, ['kind', 'sdp']) &&
				typeof s.sdp === 'string' &&
				s.sdp.startsWith('v=0') &&
				s.sdp.length <= 15000
				? m
				: null;
		if (s.kind !== 'ice' || !exact(s, ['kind', 'candidate'])) return null;
		const c = s.candidate;
		return c &&
			typeof c === 'object' &&
			!Array.isArray(c) &&
			Object.keys(c).every((k) =>
				['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'].includes(k)
			) &&
			typeof c.candidate === 'string' &&
			c.candidate.length <= 2048 &&
			(c.sdpMid == null || (typeof c.sdpMid === 'string' && c.sdpMid.length <= 256)) &&
			(c.sdpMLineIndex == null || (validTick(c.sdpMLineIndex) && c.sdpMLineIndex <= 256)) &&
			(c.usernameFragment == null ||
				(typeof c.usernameFragment === 'string' && c.usernameFragment.length <= 256))
			? m
			: null;
	} catch {
		return null;
	}
}
export function parsePeerMessage(raw: string): { type: 'PING_PEER'; value: string } | null {
	if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return null;
	try {
		const message = JSON.parse(raw);
		if (
			!message ||
			typeof message !== 'object' ||
			Array.isArray(message) ||
			Object.keys(message).length !== 2 ||
			message.type !== 'PING_PEER' ||
			typeof message.value !== 'string' ||
			message.value.length > 160 ||
			message.value.trim().length === 0
		)
			return null;
		return { type: 'PING_PEER', value: message.value.trim() };
	} catch {
		return null;
	}
}

export const ONLINE = {
	worldWidth: 1280,
	worldHeight: 720,
	inputDelay: 2,
	progressMs: 100,
	maxLead: 10,
	maxCatchUp: 8,
	maxBehind: 180,
	peerTimeoutMs: 15000,
	reconnectGraceMs: 45000,
	recoveryTimeoutMs: 45000,
	maxRecoveryAttempts: 2,
	maxRecoveries: 8,
	maxMatchTicks: 40000,
	maxHistoryEvents: 4096,
	recoveryChunkEvents: 48,
	replayChunkTicks: 120,
	pingMs: 2000,
	connectTimeoutMs: 8000,
	maxReconnectAttempts: 8,
} as const;
export const ONLINE_COMMANDS = [
	'forwardJump',
	'highJump',
	'moveLeft',
	'moveRight',
	'aimUp',
	'aimDown',
	'bazooka',
	'grenade',
	'switchWeapon',
	'fuse1',
	'fuse2',
	'fuse3',
	'fuse4',
	'fuse5',
	'chargeStart',
	'fire',
	'cancelCharge',
] as const;
export type OnlineCommand = (typeof ONLINE_COMMANDS)[number];
export const RECOVERABLE_FAILURES = [
	'LATE_INPUT',
	'BAD_SEQUENCE',
	'SIMULATION_BEHIND',
	'PEER_TIMEOUT',
	'DESYNC',
] as const;
export function isRecoverableFailure(code: string): code is (typeof RECOVERABLE_FAILURES)[number] {
	return RECOVERABLE_FAILURES.some((value) => value === code);
}
export type InputChange = {
	moveDirection?: -1 | 0 | 1;
	aimDirection?: -1 | 0 | 1;
	commands: OnlineCommand[];
};
export type OnlineConfig = {
	matchId: string;
	seed: number;
	roster: number;
	worldWidth: number;
	worldHeight: number;
};
export type InputCommit = {
	type: 'INPUT_COMMIT';
	matchId: string;
	serverSequence: number;
	effectiveTick: number;
	seat: Seat;
	turnIndex: number;
	change: InputChange;
};
export type Checkpoint = {
	matchId: string;
	checkpointId: string;
	logicalTick: number;
	turnIndex: number;
	hash: string;
};
export type PeerProgress = {
	type: 'PEER_PROGRESS';
	matchId: string;
	tick: number;
	safeTick: number;
	turnIndex: number;
	sequence: number;
};
export function validPeerProgress(value: unknown): value is PeerProgress {
	if (!value || typeof value !== 'object') return false;
	const m = value as PeerProgress;
	return (
		exact(m, ['type', 'matchId', 'tick', 'safeTick', 'turnIndex', 'sequence']) &&
		m.type === 'PEER_PROGRESS' &&
		typeof m.matchId === 'string' &&
		/^[a-f0-9-]{36}$/.test(m.matchId) &&
		validTick(m.tick) &&
		validTick(m.safeTick) &&
		m.safeTick >= m.tick &&
		m.safeTick <= m.tick + 180 &&
		validTick(m.turnIndex) &&
		validTick(m.sequence)
	);
}
export function validCommit(value: unknown): value is InputCommit {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const c = value as InputCommit;
	return (
		exact(c, [
			'type',
			'matchId',
			'serverSequence',
			'effectiveTick',
			'seat',
			'turnIndex',
			'change',
		]) &&
		c.type === 'INPUT_COMMIT' &&
		typeof c.matchId === 'string' &&
		/^[a-f0-9-]{36}$/.test(c.matchId) &&
		validTick(c.serverSequence) &&
		c.serverSequence > 0 &&
		validTick(c.effectiveTick) &&
		c.effectiveTick <= ONLINE.maxMatchTicks &&
		validTick(c.turnIndex) &&
		(c.seat === 'HOST' || c.seat === 'GUEST') &&
		validChange(c.change)
	);
}
export type MatchServerMessage =
	| (PeerProgress & { from: Seat })
	| { type: 'MIRROR_ACK'; matchId: string; serverSequence: number }
	| { type: 'RECOVERY_FLUSH'; matchId: string }
	| { type: 'MATCH_PREPARE'; config: OnlineConfig; recovering?: boolean }
	| { type: 'MATCH_SUSPENDED'; matchId: string; reason: string; deadline: number }
	| {
			type: 'RECOVERY_BEGIN';
			matchId: string;
			recoveryId: number;
			targetTick: number;
			serverSequence: number;
			clientSequences: Record<Seat, number>;
			eventCount: number;
	  }
	| {
			type: 'RECOVERY_LOG';
			matchId: string;
			recoveryId: number;
			offset: number;
			events: InputCommit[];
	  }
	| { type: 'RECOVERY_REPLAY'; matchId: string; recoveryId: number }
	| {
			type: 'RECOVERY_GO';
			matchId: string;
			recoveryId: number;
			targetTick: number;
			ended: boolean;
			direct?: boolean;
	  }
	| { type: 'MATCH_GO'; matchId: string; direct?: boolean }
	| InputCommit
	| { type: 'PROGRESS'; matchId: string; hostTick: number; guestTick: number }
	| ({ type: 'CHECKPOINT_OK' } & Checkpoint)
	| { type: 'MATCH_STOP'; matchId: string; code: string };
export type ClientMessage =
	| PeerProgress
	| SignalMessage
	| { type: 'INPUT_MIRROR'; matchId: string; commit: InputCommit }
	| { type: 'FLUSH_READY'; matchId: string; serverSequence: number }
	| { type: 'START' | 'LEAVE' }
	| { type: 'PING'; id: number }
	| {
			type: 'RECOVERY_READY';
			matchId: string;
			recoveryId: number;
			targetTick: number;
			hash: string;
			turnIndex: number;
			ended: boolean;
			direct?: boolean;
	  }
	| { type: 'PING_PEER'; value: string }
	| { type: 'MATCH_READY'; matchId: string; direct?: boolean }
	| { type: 'PROGRESS'; matchId: string; logicalTick: number }
	| {
			type: 'INPUT_PROPOSE';
			matchId: string;
			clientSequence: number;
			clientTick: number;
			turnIndex: number;
			change: InputChange;
			delayTicks?: number;
	  }
	| ({ type: 'CHECKPOINT' } & Checkpoint)
	| {
			type: 'MATCH_FAIL';
			matchId: string;
			code:
				| 'LATE_INPUT'
				| 'BAD_SEQUENCE'
				| 'SIMULATION_BEHIND'
				| 'PEER_TIMEOUT'
				| 'PREPARE_FAILED'
				| 'DESYNC';
	  };
export const validTick = (value: unknown): value is number =>
	Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1000000;
const exact = (value: object, keys: string[]) =>
	Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
export function validChange(value: unknown): value is InputChange {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const v = value as InputChange;
	return (
		Object.keys(v).every((key) => ['moveDirection', 'aimDirection', 'commands'].includes(key)) &&
		[v.moveDirection, v.aimDirection].every(
			(n) => n === undefined || n === -1 || n === 0 || n === 1
		) &&
		Array.isArray(v.commands) &&
		v.commands.length <= 8 &&
		v.commands.every((c) => ONLINE_COMMANDS.includes(c))
	);
}
export function parseClientMessage(raw: string): ClientMessage | null {
	const signal = parseSignalMessage(raw);
	if (signal) return signal;
	if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return null;
	try {
		const m = JSON.parse(raw);
		if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
		if (m.type === 'PING_PEER') return parsePeerMessage(raw);
		if (m.type === 'PING') return exact(m, ['type', 'id']) && validTick(m.id) ? m : null;
		if (m.type === 'START' || m.type === 'LEAVE') return exact(m, ['type']) ? m : null;
		if (typeof m.matchId !== 'string' || !/^[a-f0-9-]{36}$/.test(m.matchId)) return null;
		switch (m.type) {
			case 'PEER_PROGRESS':
				return validPeerProgress(m) ? m : null;
			case 'INPUT_MIRROR':
				return exact(m, ['type', 'matchId', 'commit']) &&
					validCommit(m.commit) &&
					m.commit.matchId === m.matchId
					? m
					: null;
			case 'FLUSH_READY':
				return exact(m, ['type', 'matchId', 'serverSequence']) && validTick(m.serverSequence)
					? m
					: null;
			case 'RECOVERY_READY':
				return (m.direct === undefined || typeof m.direct === 'boolean') &&
					exact(m, [
						'type',
						'matchId',
						'recoveryId',
						'targetTick',
						'hash',
						'turnIndex',
						'ended',
						...(m.direct === undefined ? [] : ['direct']),
					]) &&
					validTick(m.recoveryId) &&
					validTick(m.targetTick) &&
					m.targetTick <= ONLINE.maxMatchTicks &&
					validTick(m.turnIndex) &&
					typeof m.ended === 'boolean' &&
					typeof m.hash === 'string' &&
					/^[a-f0-9]{8}$/.test(m.hash)
					? m
					: null;
			case 'MATCH_READY':
				return exact(m, ['type', 'matchId', ...(m.direct === undefined ? [] : ['direct'])]) &&
					(m.direct === undefined || typeof m.direct === 'boolean')
					? m
					: null;
			case 'PROGRESS':
				return exact(m, ['type', 'matchId', 'logicalTick']) && validTick(m.logicalTick) ? m : null;
			case 'INPUT_PROPOSE':
				return exact(m, [
					'type',
					'matchId',
					'clientSequence',
					'clientTick',
					'turnIndex',
					'change',
					...(m.delayTicks === undefined ? [] : ['delayTicks']),
				]) &&
					(m.delayTicks === undefined ||
						(validTick(m.delayTicks) && m.delayTicks >= 1 && m.delayTicks <= 10)) &&
					validTick(m.clientSequence) &&
					m.clientSequence > 0 &&
					validTick(m.clientTick) &&
					validTick(m.turnIndex) &&
					validChange(m.change)
					? m
					: null;
			case 'CHECKPOINT':
				return exact(m, ['type', 'matchId', 'checkpointId', 'logicalTick', 'turnIndex', 'hash']) &&
					validTick(m.logicalTick) &&
					validTick(m.turnIndex) &&
					typeof m.checkpointId === 'string' &&
					/^(initial|turn-\d+|end)$/.test(m.checkpointId) &&
					typeof m.hash === 'string' &&
					/^[a-f0-9]{8}$/.test(m.hash)
					? m
					: null;
			case 'MATCH_FAIL':
				return exact(m, ['type', 'matchId', 'code']) &&
					[
						'LATE_INPUT',
						'BAD_SEQUENCE',
						'SIMULATION_BEHIND',
						'PEER_TIMEOUT',
						'PREPARE_FAILED',
						'DESYNC',
					].includes(m.code)
					? m
					: null;
			default:
				return null;
		}
	} catch {
		return null;
	}
}
