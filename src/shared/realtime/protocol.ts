export type Seat = 'HOST' | 'GUEST';
export type RoomState = {
	roomId: string;
	hostConnected: boolean;
	guestConnected: boolean;
	full: boolean;
	ready: boolean;
	expiresAt: number;
};
export type RoomCredential = { roomId: string; token: string; seat: Seat };
export type ServerMessage =
	| { type: 'CONNECTED'; seat: Seat }
	| { type: 'ROOM_STATE'; state: RoomState }
	| { type: 'PLAYER_JOINED' | 'PLAYER_LEFT'; seat: Seat }
	| { type: 'PEER_MESSAGE'; from: Seat; value: string }
	| { type: 'ERROR'; code: string };
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_ID_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const MAX_MESSAGE_BYTES = 1024;
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
