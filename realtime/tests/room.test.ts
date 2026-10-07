import { afterEach, expect, it, vi } from 'vitest';
import { ONLINE, type Seat, type ServerMessage } from '../../src/shared/realtime/protocol';

vi.mock('cloudflare:workers', () => ({
	DurableObject: class {
		constructor(
			public ctx: unknown,
			public env: unknown
		) {}
	},
}));

import { GameRoom } from '../src/index';
import { beginRecovery, coordinate, prepareMatch } from '../src/match';

class Socket {
	static OPEN = 1;
	readyState = 1;
	data: { seat: Seat; active: boolean };
	messages: ServerMessage[] = [];
	constructor(seat: Seat) {
		this.data = { seat, active: true };
	}
	deserializeAttachment() {
		return this.data;
	}
	serializeAttachment(value: typeof this.data) {
		this.data = value;
	}
	send(raw: string) {
		this.messages.push(JSON.parse(raw));
	}
	close() {
		this.readyState = 3;
	}
}
function fixture() {
	vi.stubGlobal('WebSocket', Socket);
	const m = prepareMatch(1);
	const host = new Socket('HOST'),
		guest = new Socket('GUEST');
	for (const seat of ['HOST', 'GUEST'] as Seat[])
		coordinate(m, seat, { type: 'MATCH_READY', matchId: m.config.matchId });
	coordinate(m, 'HOST', {
		type: 'INPUT_PROPOSE',
		matchId: m.config.matchId,
		clientSequence: 1,
		clientTick: 0,
		turnIndex: 0,
		change: { commands: ['bazooka'] },
	});
	const { history, ...metadata } = m;
	const values = new Map<string, unknown>([
		['match', metadata],
		['input:000001', history[0]],
		[
			'lobby',
			{
				roomId: 'A7F2KD',
				hostToken: 'h',
				guestToken: 'g',
				matchStarted: true,
				expiresAt: Date.now() + 1800000,
			},
		],
	]);
	const storage = {
		get: async (key: string) => structuredClone(values.get(key)),
		list: async ({ prefix }: { prefix: string }) =>
			new Map(
				[...values].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])
			),
		put: vi.fn(async (entries: Record<string, unknown>) => {
			for (const [k, v] of Object.entries(entries)) values.set(k, structuredClone(v));
		}),
		setAlarm: vi.fn(async (_at: number) => {}),
		deleteAll: async () => values.clear(),
		deleteAlarm: async () => {},
	};
	const ctx = {
		storage,
		getWebSockets: () => [host, guest],
		blockConcurrencyWhile: <T>(f: () => Promise<T>) => f(),
	};
	const room = () => new GameRoom(ctx as unknown as DurableObjectState, {} as never);
	return { m, host, guest, storage, values, room };
}
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
it('actual room responds to PING without writing metadata or history', async () => {
	const f = fixture();
	await f.room().webSocketMessage(f.host as unknown as WebSocket, '{"type":"PING","id":4}');
	expect(f.host.messages.at(-1)).toEqual({ type: 'PONG', id: 4 });
	expect(f.storage.put).not.toHaveBeenCalled();
	expect(f.values.get('input:000001')).toEqual(f.m.history[0]);
});
it.each(['offer', 'answer', 'ice'] as const)(
	'relays typed %s only to the opposite authenticated active seat without persistence',
	async (kind) => {
		const f = fixture();
		const sender = kind === 'answer' ? f.guest : f.host,
			receiver = kind === 'answer' ? f.host : f.guest;
		const signal = {
			type: 'SIGNAL',
			connectionId: crypto.randomUUID(),
			signal:
				kind === 'ice'
					? { kind, candidate: { candidate: 'candidate:1', sdpMid: '0' } }
					: { kind, sdp: `v=0\r\n${'a'.repeat(2000)}` },
		};
		await f.room().webSocketMessage(sender as unknown as WebSocket, JSON.stringify(signal));
		expect(sender.messages).toEqual([]);
		expect(receiver.messages).toEqual([{ ...signal, from: sender.data.seat }]);
		expect(f.storage.put).not.toHaveBeenCalled();
	}
);
it('inactive sockets cannot signal and GUEST cannot impersonate the offerer', async () => {
	const f = fixture(),
		room = f.room();
	const offer = {
		type: 'SIGNAL',
		connectionId: crypto.randomUUID(),
		signal: { kind: 'offer', sdp: 'v=0' },
	};
	await room.webSocketMessage(f.guest as unknown as WebSocket, JSON.stringify(offer));
	expect(f.guest.messages.at(-1)).toEqual({ type: 'ERROR', code: 'INVALID_MESSAGE' });
	f.host.data.active = false;
	await room.webSocketMessage(f.host as unknown as WebSocket, JSON.stringify(offer));
	expect(f.guest.messages).toHaveLength(1);
	expect(f.storage.put).not.toHaveBeenCalled();
});
it('malformed and oversized signaling are rejected while another room remains isolated', async () => {
	const a = fixture(),
		b = fixture();
	await a.room().webSocketMessage(
		a.host as unknown as WebSocket,
		JSON.stringify({
			type: 'SIGNAL',
			connectionId: crypto.randomUUID(),
			signal: { kind: 'ice', candidate: { candidate: 'x', sdpMLineIndex: -1 } },
		})
	);
	expect(a.host.messages.at(-1)).toEqual({ type: 'ERROR', code: 'INVALID_MESSAGE' });
	await a.room().webSocketMessage(
		a.host as unknown as WebSocket,
		JSON.stringify({
			type: 'SIGNAL',
			connectionId: crypto.randomUUID(),
			signal: { kind: 'offer', sdp: `v=0${'x'.repeat(17000)}` },
		})
	);
	expect(a.host.messages.at(-1)).toEqual({ type: 'ERROR', code: 'MESSAGE_TOO_LARGE' });
	expect(a.guest.messages).toEqual([]);
	expect(b.guest.messages).toEqual([]);
});
it('acknowledges a direct commit only after the actual storage write and rehydrates its log', async () => {
	const f = fixture();
	f.m.direct = true;
	const { history: _h, ...metadata } = f.m;
	f.values.set('match', metadata);
	const commit = {
		...f.m.history[0],
		serverSequence: 2,
		effectiveTick: 4,
		change: { commands: ['grenade'] },
	};
	const put = f.storage.put;
	put.mockImplementationOnce(async (entries) => {
		expect(f.host.messages).toEqual([]);
		for (const [k, v] of Object.entries(entries)) f.values.set(k, structuredClone(v));
	});
	await f
		.room()
		.webSocketMessage(
			f.host as unknown as WebSocket,
			JSON.stringify({ type: 'INPUT_MIRROR', matchId: f.m.config.matchId, commit })
		);
	expect(f.values.get('input:000002')).toEqual(commit);
	expect(f.host.messages.at(-1)).toEqual({
		type: 'MIRROR_ACK',
		matchId: f.m.config.matchId,
		serverSequence: 2,
	});
});
it('actual unexpected close suspends and rehydrated alarm terminates at the persisted deadline', async () => {
	const f = fixture();
	await f.room().webSocketClose(f.guest as unknown as WebSocket);
	expect(f.host.messages.some((m) => m.type === 'MATCH_SUSPENDED')).toBe(true);
	expect(f.values.get('match')).toMatchObject({ phase: 'suspended', serverSequence: 1 });
	expect(f.values.get('match')).not.toHaveProperty('history');
	const deadline = (f.values.get('match') as { deadline: number }).deadline;
	expect(f.storage.setAlarm).toHaveBeenLastCalledWith(deadline);
	vi.spyOn(Date, 'now').mockReturnValue(deadline);
	await f.room().alarm();
	expect(f.host.messages.at(-1)).toMatchObject({
		type: 'MATCH_STOP',
		code: 'OPPONENT_DISCONNECTED',
	});
});
it('rehydrated recovery loads the separately persisted event log and requires both hashes', async () => {
	const f = fixture();
	beginRecovery(f.m);
	const { history: _history, ...metadata } = f.m;
	f.values.set('match', metadata);
	const ready = {
		type: 'RECOVERY_READY',
		matchId: f.m.config.matchId,
		recoveryId: f.m.recoveryId,
		targetTick: 0,
		hash: '12345678',
		turnIndex: 0,
		ended: false,
	};
	await f.room().webSocketMessage(f.host as unknown as WebSocket, JSON.stringify(ready));
	expect(f.host.messages.some((m) => m.type === 'RECOVERY_GO')).toBe(false);
	await f.room().webSocketMessage(f.guest as unknown as WebSocket, JSON.stringify(ready));
	expect(f.host.messages.at(-1)?.type).toBe('RECOVERY_GO');
	expect(f.values.get('input:000001')).toEqual(f.m.history[0]);
});
it('actual explicit match leave terminates immediately, while the other room stays playable', async () => {
	const a = fixture(),
		b = fixture();
	await a.room().webSocketMessage(a.guest as unknown as WebSocket, '{"type":"LEAVE"}');
	expect(a.host.messages.some((m) => m.type === 'MATCH_STOP' && m.code === 'OPPONENT_LEFT')).toBe(
		true
	);
	expect(a.values.get('match')).toMatchObject({ phase: 'stopped' });
	expect(a.values.get('match')).not.toHaveProperty('deadline');
	expect(b.values.get('match')).toMatchObject({ phase: 'playing' });
	expect(b.host.messages).toEqual([]);
	expect(ONLINE.reconnectGraceMs).toBe(45000);
});
