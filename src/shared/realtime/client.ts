import {
	ROOM_ID_PATTERN,
	type RoomCredential,
	type RoomState,
	type Seat,
	type ServerMessage,
} from './protocol';

export type LobbyView = {
	status: 'idle' | 'connecting' | 'connected' | 'disconnected';
	credential?: RoomCredential;
	room?: RoomState;
	error?: string;
	peerMessage?: string;
};
function isSeat(value: unknown): value is Seat {
	return value === 'HOST' || value === 'GUEST';
}
export function parseServerMessage(raw: string): ServerMessage | null {
	try {
		const message = JSON.parse(raw);
		if (!message || typeof message !== 'object') return null;
		switch (message.type) {
			case 'CONNECTED':
			case 'PLAYER_JOINED':
			case 'PLAYER_LEFT':
				return isSeat(message.seat) ? message : null;
			case 'ERROR':
				return typeof message.code === 'string' ? message : null;
			case 'PEER_MESSAGE':
				return isSeat(message.from) &&
					typeof message.value === 'string' &&
					message.value.length <= 160
					? message
					: null;
			case 'ROOM_STATE': {
				const state = message.state;
				return state &&
					ROOM_ID_PATTERN.test(state.roomId) &&
					['hostConnected', 'guestConnected', 'ready', 'full'].every(
						(key) => typeof state[key] === 'boolean'
					) &&
					Number.isFinite(state.expiresAt)
					? message
					: null;
			}
			default:
				return null;
		}
	} catch {
		return null;
	}
}
export function inviteUrl(currentUrl: string, roomId: string) {
	const url = new URL(currentUrl);
	url.search = '';
	url.hash = '';
	url.searchParams.set('room', roomId);
	return url.toString();
}
export class LobbyClient {
	private socket?: WebSocket;
	private generation = 0;
	private view: LobbyView = { status: 'idle' };
	constructor(private readonly update: (view: LobbyView) => void) {}
	private emit(change: Partial<LobbyView>) {
		this.view = { ...this.view, ...change };
		this.update(this.view);
	}
	private backend() {
		const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
		if (configured) return configured.replace(/\/$/, '');
		if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname))
			return 'http://127.0.0.1:8787';
		return 'https://worms-js-realtime.godfrey-namco.workers.dev';
	}
	private storageKey(roomId: string) {
		return `worms-lobby:${this.backend()}:${roomId}`;
	}
	private saved(roomId: string): RoomCredential | undefined {
		try {
			const value = JSON.parse(sessionStorage.getItem(this.storageKey(roomId)) ?? 'null');
			if (value?.roomId === roomId && typeof value.token === 'string' && isSeat(value.seat))
				return value;
		} catch {
			/* Storage may be unavailable; connection still works for this page. */
		}
		return undefined;
	}
	private async reserve(path: string): Promise<RoomCredential> {
		const response = await fetch(`${this.backend()}${path}`, { method: 'POST' });
		const data = await response.json();
		if (!response.ok) throw new Error(data.error?.code ?? 'REQUEST_FAILED');
		if (!ROOM_ID_PATTERN.test(data.roomId) || typeof data.token !== 'string' || !isSeat(data.seat))
			throw new Error('INVALID_RESPONSE');
		return data;
	}
	private async enter(roomId?: string) {
		this.disconnect();
		const generation = this.generation;
		this.view = { status: 'connecting' };
		this.update(this.view);
		try {
			if (roomId && !ROOM_ID_PATTERN.test(roomId)) throw new Error('INVALID_ROOM_ID');
			const credential = roomId
				? (this.saved(roomId) ?? (await this.reserve(`/rooms/${roomId}/join`)))
				: await this.reserve('/rooms');
			if (generation !== this.generation) return;
			try {
				sessionStorage.setItem(this.storageKey(credential.roomId), JSON.stringify(credential));
			} catch {
				/* Ephemeral in-memory credential remains usable. */
			}
			this.connectRoom(credential);
		} catch (error) {
			if (generation === this.generation)
				this.emit({
					status: 'disconnected',
					error: error instanceof Error ? error.message : 'CONNECTION_FAILED',
				});
		}
	}
	createRoom() {
		return this.enter();
	}
	joinRoom(roomId: string) {
		return this.enter(roomId.trim().toUpperCase());
	}
	connectRoom(credential: RoomCredential) {
		const url = new URL(`${this.backend()}/rooms/${credential.roomId}/ws`);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		const socket = new WebSocket(url, ['worms-lobby-v1', `seat.${credential.token}`]);
		this.socket = socket;
		this.emit({ credential, error: undefined });
		socket.onmessage = (event) => {
			if (this.socket !== socket) return;
			const message = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
			if (!message) {
				this.emit({ error: 'INVALID_RESPONSE' });
				return;
			}
			if (message.type === 'CONNECTED') this.emit({ status: 'connected' });
			if (message.type === 'ROOM_STATE') this.emit({ room: message.state });
			if (message.type === 'PEER_MESSAGE') this.emit({ peerMessage: message.value });
			if (message.type === 'ERROR') this.emit({ error: message.code });
		};
		socket.onerror = () => {
			if (this.socket === socket) this.emit({ error: 'CONNECTION_FAILED' });
		};
		socket.onclose = () => {
			if (this.socket === socket) this.emit({ status: 'disconnected', room: undefined });
		};
	}
	pingPeer() {
		if (this.socket?.readyState === WebSocket.OPEN)
			this.socket.send(JSON.stringify({ type: 'PING_PEER', value: 'hello' }));
	}
	reconnect() {
		if (this.view.credential) {
			const credential = this.view.credential;
			this.disconnect();
			this.emit({ status: 'connecting', room: undefined, error: undefined });
			this.connectRoom(credential);
		}
	}
	disconnect() {
		this.generation++;
		const socket = this.socket;
		this.socket = undefined;
		socket?.close(1000, 'Left lobby');
	}
}
