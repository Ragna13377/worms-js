import type { RoomState, Seat } from '../../src/shared/realtime/protocol';

export const ROOM_LIFETIME_MS = 30 * 60 * 1000;
export type Lobby = { roomId: string; expiresAt: number; hostToken: string; guestToken?: string };
export function isExpired(lobby: Lobby, now = Date.now()) {
	return now >= lobby.expiresAt;
}
export function seatForToken(lobby: Lobby, token: string | null): Seat | null {
	if (!token) return null;
	if (token === lobby.hostToken) return 'HOST';
	if (token === lobby.guestToken) return 'GUEST';
	return null;
}
export function claimGuest(lobby: Lobby, token: string): Lobby | null {
	return lobby.guestToken ? null : { ...lobby, guestToken: token };
}
export function roomState(lobby: Lobby, seats: Seat[]): RoomState {
	const hostConnected = seats.includes('HOST');
	const guestConnected = seats.includes('GUEST');
	return {
		roomId: lobby.roomId,
		expiresAt: lobby.expiresAt,
		hostConnected,
		guestConnected,
		full: !!lobby.guestToken,
		ready: hostConnected && guestConnected,
	};
}
