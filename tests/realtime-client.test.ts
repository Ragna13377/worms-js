import { expect, it } from 'vitest';
import { inviteUrl, parseServerMessage } from '../src/shared/realtime/client';

it('creates invites using the current frontend path and only the room query', () => {
	expect(inviteUrl('https://ragna13377.github.io/worms-js/?token=secret#x', 'A7F2KD')).toBe(
		'https://ragna13377.github.io/worms-js/?room=A7F2KD'
	);
	expect(inviteUrl('http://localhost:3000/', 'A7F2KD')).toBe('http://localhost:3000/?room=A7F2KD');
});
it('validates server messages at the client boundary', () => {
	expect(parseServerMessage('{"type":"CONNECTED","seat":"HOST"}')).toEqual({
		type: 'CONNECTED',
		seat: 'HOST',
	});
	for (const raw of [
		'{',
		'null',
		'{"type":"CONNECTED","seat":"THIRD"}',
		'{"type":"ROOM_STATE","state":{}}',
		'{"type":"PHYSICS"}',
	])
		expect(parseServerMessage(raw)).toBeNull();
});
