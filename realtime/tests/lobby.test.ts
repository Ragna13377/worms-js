import { describe, expect, it } from 'vitest';
import { parsePeerMessage, ROOM_ID_PATTERN } from '../../src/shared/realtime/protocol';
import {
	claimGuest,
	isExpired,
	type Lobby,
	ROOM_LIFETIME_MS,
	roomState,
	seatForToken,
} from '../src/lobby';

const host: Lobby = {
	roomId: 'A7F2KD',
	hostToken: 'host-secret',
	expiresAt: 100 + ROOM_LIFETIME_MS,
};
describe('lobby rules', () => {
	it('allocates one guest and keeps seats reserved across disconnects', () => {
		const full = claimGuest(host, 'guest-secret');
		expect(full).not.toBeNull();
		if (!full) throw new Error('Expected reservation');
		expect(claimGuest(full, 'third')).toBeNull();
		expect(seatForToken(full, 'host-secret')).toBe('HOST');
		expect(seatForToken(full, 'guest-secret')).toBe('GUEST');
		expect(seatForToken(full, 'third')).toBeNull();
		expect(seatForToken(host, null)).toBeNull();
		expect(roomState(full, []).full).toBe(true);
	});
	it('publishes safe presence and ready only for two connected players', () => {
		const full = claimGuest(host, 'guest-secret');
		if (!full) throw new Error('Expected reservation');
		expect(roomState(full, ['HOST']).ready).toBe(false);
		expect(roomState(full, ['HOST', 'GUEST']).ready).toBe(true);
		expect(JSON.stringify(roomState(full, ['HOST', 'GUEST']))).not.toContain('secret');
		expect(roomState(full, ['GUEST']).hostConnected).toBe(false);
	});
	it('keeps independent rooms and credentials isolated', () => {
		const other = { ...host, roomId: 'K92PQM', hostToken: 'other' };
		expect(seatForToken(other, host.hostToken)).toBeNull();
		claimGuest(other, 'guest');
		expect(host.guestToken).toBeUndefined();
		expect(roomState(other, []).roomId).not.toBe(host.roomId);
	});
	it('expires at the absolute 30 minute boundary', () => {
		expect(isExpired(host, host.expiresAt - 1)).toBe(false);
		expect(isExpired(host, host.expiresAt)).toBe(true);
	});
});
describe('bounded protocol', () => {
	it('normalizes the one allowed peer message', () => {
		expect(parsePeerMessage('{"type":"PING_PEER","value":" hello "}')).toEqual({
			type: 'PING_PEER',
			value: 'hello',
		});
	});
	it.each([
		'{',
		'null',
		'[]',
		'{"type":"UNKNOWN","value":"x"}',
		'{"type":"PING_PEER","value":42}',
		'{"type":"PING_PEER","value":" "}',
		'{"type":"PING_PEER","value":"x","extra":true}',
		JSON.stringify({ type: 'PING_PEER', value: 'x'.repeat(161) }),
		' '.repeat(1025),
	])('rejects invalid messages: %s', (raw) => {
		expect(parsePeerMessage(raw)).toBeNull();
	});
	it('only accepts short readable room IDs', () => {
		expect(ROOM_ID_PATTERN.test('A7F2KD')).toBe(true);
		expect(ROOM_ID_PATTERN.test('../../')).toBe(false);
		expect(ROOM_ID_PATTERN.test('I01OAB')).toBe(false);
	});
});
