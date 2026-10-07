import { afterEach, expect, it, vi } from 'vitest';
import { LobbyClient, parseServerMessage } from '../src/shared/realtime/client';
import { ONLINE } from '../src/shared/realtime/protocol';
import { onlineStatusCopy } from '../src/shared/ui/OnlineStatus';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
it('measures matching RTT, smooths it, ignores unmatched pong and stops ping on disconnect', () => {
	vi.useFakeTimers();
	let now = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	class Socket {
		static OPEN = 1;
		readyState = 1;
		send = vi.fn();
		close = vi.fn();
		onmessage?: (e: { data: string }) => void;
		onclose?: () => void;
	}
	vi.stubGlobal('WebSocket', Socket);
	vi.stubGlobal('window', { location: { hostname: 'localhost' } });
	const client = new LobbyClient();
	// Capture the actual transport created by connectRoom.
	const sockets: Socket[] = [];
	vi.stubGlobal(
		'WebSocket',
		class extends Socket {
			constructor() {
				super();
				sockets.push(this);
			}
		}
	);
	client.connectRoom({ roomId: 'A7F2KD', token: 'test-token', seat: 'HOST' });
	const ws = sockets[0],
		receive = (m: unknown) => ws.onmessage?.({ data: JSON.stringify(m) });
	receive({ type: 'CONNECTED', seat: 'HOST' });
	expect(ws.send).toHaveBeenLastCalledWith(JSON.stringify({ type: 'PING', id: 1 }));
	now = 100;
	receive({ type: 'PONG', id: 9 });
	expect(client.snapshot.ping).toBeUndefined();
	receive({ type: 'PONG', id: 1 });
	expect(client.snapshot.ping).toBe(100);
	vi.advanceTimersByTime(ONLINE.pingMs);
	now = 300;
	receive({ type: 'PONG', id: 2 });
	expect(client.snapshot.ping).toBe(130);
	client.disconnect();
	const count = ws.send.mock.calls.length;
	vi.advanceTimersByTime(ONLINE.pingMs * 3);
	expect(ws.send).toHaveBeenCalledTimes(count);
});
it('validates bounded recovery messages and translates internal failures into player copy', () => {
	const matchId = '00000000-0000-4000-8000-000000000000';
	expect(
		parseServerMessage(
			JSON.stringify({
				type: 'RECOVERY_LOG',
				matchId,
				recoveryId: 1,
				offset: 0,
				events: Array(49).fill({}),
			})
		)
	).toBeNull();
	expect(parseServerMessage('{"type":"PONG","id":-1}')).toBeNull();
	expect(onlineStatusCopy('DESYNC')[0]).toBe('fatalDesync');
	expect(onlineStatusCopy('SIMULATION_BEHIND')[0]).toBe('recoveryFailed');
	expect(onlineStatusCopy('SERVER_LIMIT')[0]).toBe('serverLimit');
	expect(onlineStatusCopy('CONNECTION_FAILED')[0]).toBe('serverUnavailable');
});
