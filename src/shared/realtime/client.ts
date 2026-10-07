import { type PeerMessage, PeerTransport } from './peer';
import {
	type ClientMessage,
	MAX_MESSAGE_BYTES,
	ONLINE,
	type OnlineConfig,
	parseSignalMessage,
	ROOM_ID_PATTERN,
	type RoomCredential,
	type RoomState,
	type Seat,
	type ServerMessage,
	validChange,
	validPeerProgress,
	validTick,
} from './protocol';

export type LobbyView = {
	status: 'idle' | 'connecting' | 'connected' | 'disconnected';
	credential?: RoomCredential;
	room?: RoomState;
	error?: string;
	peerMessage?: string;
	match?: OnlineConfig;
	ping?: number;
	serverPing?: number;
	peerPing?: number;
	transport?: 'p2p' | 'websocket-fallback';
};
function isSeat(value: unknown): value is Seat {
	return value === 'HOST' || value === 'GUEST';
}
export function parseServerMessage(raw: string): ServerMessage | null {
	if (new TextEncoder().encode(raw).byteLength > 24000) return null;
	try {
		const message = JSON.parse(raw);
		if (!message || typeof message !== 'object') return null;
		if (message.type === 'SIGNAL') {
			const { from, ...signal } = message;
			return isSeat(from) && parseSignalMessage(JSON.stringify(signal)) ? message : null;
		}
		if (
			message.type !== 'RECOVERY_LOG' &&
			new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES
		)
			return null;
		switch (message.type) {
			case 'PEER_PROGRESS': {
				const { from, ...progress } = message;
				return isSeat(from) && validPeerProgress(progress) ? message : null;
			}
			case 'RECOVERY_FLUSH':
				return typeof message.matchId === 'string' ? message : null;
			case 'MIRROR_ACK':
				return typeof message.matchId === 'string' && validTick(message.serverSequence)
					? message
					: null;
			case 'PONG':
				return validTick(message.id) ? message : null;
			case 'MATCH_SUSPENDED':
				return typeof message.matchId === 'string' &&
					typeof message.reason === 'string' &&
					Number.isFinite(message.deadline)
					? message
					: null;
			case 'RECOVERY_BEGIN':
				return typeof message.matchId === 'string' &&
					validTick(message.recoveryId) &&
					validTick(message.targetTick) &&
					message.targetTick <= ONLINE.maxMatchTicks &&
					validTick(message.serverSequence) &&
					validTick(message.eventCount) &&
					message.eventCount <= ONLINE.maxHistoryEvents &&
					message.eventCount === message.serverSequence &&
					validTick(message.clientSequences?.HOST) &&
					validTick(message.clientSequences?.GUEST)
					? message
					: null;
			case 'RECOVERY_LOG':
				return typeof message.matchId === 'string' &&
					validTick(message.recoveryId) &&
					validTick(message.offset) &&
					message.offset <= ONLINE.maxHistoryEvents &&
					Array.isArray(message.events) &&
					message.events.length <= ONLINE.recoveryChunkEvents &&
					message.events.every((e: unknown) => {
						if (!e || typeof e !== 'object' || !('type' in e) || e.type !== 'INPUT_COMMIT')
							return false;
						const parsed = parseServerMessage(JSON.stringify(e));
						return parsed?.type === 'INPUT_COMMIT' && parsed.matchId === message.matchId;
					})
					? message
					: null;
			case 'RECOVERY_REPLAY':
				return typeof message.matchId === 'string' && validTick(message.recoveryId)
					? message
					: null;
			case 'RECOVERY_GO':
				return typeof message.matchId === 'string' &&
					validTick(message.recoveryId) &&
					validTick(message.targetTick) &&
					message.targetTick <= ONLINE.maxMatchTicks &&
					typeof message.ended === 'boolean'
					? message
					: null;
			case 'MATCH_PREPARE': {
				const c = message.config;
				return c &&
					typeof c.matchId === 'string' &&
					/^[a-f0-9-]{36}$/.test(c.matchId) &&
					Number.isInteger(c.seed) &&
					c.seed >= 0 &&
					c.seed <= 0xffffffff &&
					[1, 2, 3].includes(c.roster) &&
					c.worldWidth === 1280 &&
					c.worldHeight === 720 &&
					(message.recovering === undefined || typeof message.recovering === 'boolean')
					? message
					: null;
			}
			case 'MATCH_GO':
				return typeof message.matchId === 'string' ? message : null;
			case 'MATCH_STOP':
				return typeof message.matchId === 'string' && typeof message.code === 'string'
					? message
					: null;
			case 'PROGRESS':
				return typeof message.matchId === 'string' &&
					validTick(message.hostTick) &&
					validTick(message.guestTick)
					? message
					: null;
			case 'INPUT_COMMIT':
				return typeof message.matchId === 'string' &&
					isSeat(message.seat) &&
					validTick(message.serverSequence) &&
					message.serverSequence > 0 &&
					validTick(message.effectiveTick) &&
					validTick(message.turnIndex) &&
					validChange(message.change)
					? message
					: null;
			case 'CHECKPOINT_OK':
				return typeof message.matchId === 'string' &&
					typeof message.checkpointId === 'string' &&
					/^[a-f0-9]{8}$/.test(message.hash) &&
					validTick(message.logicalTick) &&
					validTick(message.turnIndex)
					? message
					: null;
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
	peer?: PeerTransport;
	private peerListeners = new Set<(message: PeerMessage) => void>();
	onPeerMessage(listener: (message: PeerMessage) => void) {
		this.peerListeners.add(listener);
		return () => {
			this.peerListeners.delete(listener);
		};
	}
	private ensurePeer() {
		const seat = this.view.credential?.seat;
		if (this.peer || !seat || typeof RTCPeerConnection === 'undefined') return;
		this.peer = new PeerTransport(
			seat,
			(m) => this.send(m),
			(m) => {
				for (const listener of this.peerListeners) listener(m);
			},
			() => {
				const transport = this.peer?.state === 'p2p' ? 'p2p' : 'websocket-fallback';
				const peerPing = this.peer?.latency.rtt;
				this.emit({
					transport,
					peerPing,
					ping:
						transport === 'p2p'
							? peerPing === undefined
								? undefined
								: Math.round(peerPing)
							: this.view.serverPing === undefined
								? undefined
								: Math.round(this.view.serverPing),
				});
			}
		);
	}
	resetPeer() {
		this.peer?.dispose();
		this.peer = undefined;
		this.emit({ transport: 'websocket-fallback', peerPing: undefined, ping: this.view.serverPing });
	}
	private socket?: WebSocket;
	private generation = 0;
	private pingTimer?: ReturnType<typeof setInterval>;
	private connectTimer?: ReturnType<typeof setTimeout>;
	private retryTimer?: ReturnType<typeof setTimeout>;
	private pingId = 0;
	private pendingPing?: { id: number; at: number };
	private retryDeadline = 0;
	private retryAttempts = 0;
	private terminal = false;
	private view: LobbyView = { status: 'idle' };
	private listeners = new Set<(view: LobbyView) => void>();
	private messageListeners = new Set<(message: ServerMessage) => void>();
	constructor(private readonly update: (view: LobbyView) => void = () => {}) {}
	get snapshot() {
		return this.view;
	}
	subscribe(listener: (view: LobbyView) => void) {
		this.listeners.add(listener);
		listener(this.view);
		return () => {
			this.listeners.delete(listener);
		};
	}
	onMessage(listener: (message: ServerMessage) => void) {
		this.messageListeners.add(listener);
		return () => {
			this.messageListeners.delete(listener);
		};
	}
	send(message: ClientMessage) {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
	}
	leave() {
		this.send({ type: 'LEAVE' });
		if (this.view.credential) {
			try {
				sessionStorage.removeItem(this.storageKey(this.view.credential.roomId));
			} catch {}
		}
		this.disconnect();
		this.view = { status: 'idle' };
		this.emit({});
	}
	private emit(change: Partial<LobbyView>) {
		this.view = { ...this.view, ...change };
		this.update(this.view);
		for (const listener of this.listeners) listener(this.view);
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
		const response = await fetch(`${this.backend()}${path}`, {
			method: 'POST',
			signal: AbortSignal.timeout(ONLINE.connectTimeoutMs),
		});
		if (response.status === 429) throw new Error('SERVER_LIMIT');
		if (response.status >= 500) throw new Error('SERVER_UNAVAILABLE');
		const data = await response.json();
		if (!response.ok) throw new Error(data.error?.code ?? 'REQUEST_FAILED');
		if (!ROOM_ID_PATTERN.test(data.roomId) || typeof data.token !== 'string' || !isSeat(data.seat))
			throw new Error('INVALID_RESPONSE');
		return data;
	}
	private async enter(roomId?: string, roster = 3) {
		if (this.view.status === 'connecting') return;
		this.disconnect();
		this.terminal = false;
		this.retryDeadline = 0;
		this.retryAttempts = 0;
		const generation = this.generation;
		this.view = { status: 'connecting' };
		this.update(this.view);
		for (const listener of this.listeners) listener(this.view);
		try {
			if (roomId && !ROOM_ID_PATTERN.test(roomId)) throw new Error('INVALID_ROOM_ID');
			const credential = roomId
				? (this.saved(roomId) ?? (await this.reserve(`/rooms/${roomId}/join`)))
				: await this.reserve(`/rooms?roster=${roster}`);
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
	createRoom(roster = 3) {
		return this.enter(undefined, roster);
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
		this.connectTimer = setTimeout(() => {
			if (this.socket !== socket || this.view.status === 'connected') return;
			this.emit({ error: this.view.match ? undefined : 'SERVER_UNAVAILABLE' });
			socket.close();
		}, ONLINE.connectTimeoutMs);
		socket.onmessage = (event) => {
			if (this.socket !== socket) return;
			const message = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
			if (!message) {
				this.emit({ error: 'INVALID_RESPONSE' });
				return;
			}
			if (message.type === 'MATCH_PREPARE') this.emit({ match: message.config });
			if (message.type === 'SIGNAL') {
				this.ensurePeer();
				this.peer?.accept(message, message.from);
			}
			if (message.type === 'PLAYER_LEFT') this.resetPeer();
			if (message.type === 'ROOM_STATE' && message.state.ready) this.ensurePeer();
			for (const listener of this.messageListeners) listener(message);
			if (message.type === 'MATCH_SUSPENDED') this.resetPeer();
			if (message.type === 'RECOVERY_FLUSH') {
				this.resetPeer();
				this.ensurePeer();
			}
			if (
				(message.type === 'MATCH_GO' || message.type === 'RECOVERY_GO') &&
				message.direct !== true
			)
				this.peer?.fallback();
			if (message.type === 'CONNECTED') {
				clearTimeout(this.connectTimer);
				this.emit({ status: 'connected' });
				const ping = () => {
					this.pingId = (this.pingId + 1) % 1000000;
					this.pendingPing = {
						id: this.pingId,
						at: performance.now(),
					};
					this.send({ type: 'PING', id: this.pingId });
				};
				ping();
				clearInterval(this.pingTimer);
				this.pingTimer = setInterval(ping, ONLINE.pingMs);
			}
			if (message.type === 'PONG' && message.id === this.pendingPing?.id) {
				const rtt = Math.max(0, performance.now() - this.pendingPing.at);
				this.pendingPing = undefined;
				const serverPing =
					this.view.serverPing === undefined ? rtt : this.view.serverPing * 0.7 + rtt * 0.3;
				this.emit({
					serverPing,
					ping:
						this.view.transport === 'p2p'
							? this.view.peerPing === undefined
								? undefined
								: Math.round(this.view.peerPing)
							: Math.round(serverPing),
				});
			}
			if (message.type === 'RECOVERY_GO') {
				this.retryDeadline = 0;
				this.retryAttempts = 0;
			}
			if (
				message.type === 'MATCH_STOP' ||
				(message.type === 'CHECKPOINT_OK' && message.checkpointId === 'end') ||
				(message.type === 'RECOVERY_GO' && message.ended)
			)
				this.terminal = true;
			if (message.type === 'ROOM_STATE') this.emit({ room: message.state });
			if (message.type === 'PEER_MESSAGE') this.emit({ peerMessage: message.value });
			if (message.type === 'ERROR') this.emit({ error: message.code });
		};
		socket.onerror = () => {
			if (this.socket === socket && !this.view.match) this.emit({ error: 'SERVER_UNAVAILABLE' });
		};
		socket.onclose = () => {
			if (this.socket !== socket) return;
			clearInterval(this.pingTimer);
			clearTimeout(this.connectTimer);
			this.pendingPing = undefined;
			this.resetPeer();
			this.emit({ status: 'disconnected', ping: undefined });
			if (this.view.match && !this.terminal) {
				this.retryDeadline ||= Date.now() + ONLINE.reconnectGraceMs;
				if (++this.retryAttempts <= ONLINE.maxReconnectAttempts && Date.now() < this.retryDeadline)
					this.retryTimer = setTimeout(
						() => this.reconnect(),
						Math.min(4000, 500 * this.retryAttempts)
					);
				else this.emit({ error: 'RECOVERY_FAILED' });
			} else if (!this.terminal) this.emit({ error: this.view.error ?? 'SERVER_UNAVAILABLE' });
		};
	}
	pingPeer() {
		if (this.socket?.readyState === WebSocket.OPEN)
			this.socket.send(JSON.stringify({ type: 'PING_PEER', value: 'hello' }));
	}
	reconnect() {
		if (this.view.status === 'connecting') return;
		if (this.view.credential) {
			const credential = this.view.credential;
			this.disconnect();
			this.emit({ status: 'connecting', room: undefined, error: undefined });
			this.connectRoom(credential);
		}
	}
	disconnect() {
		this.resetPeer();
		clearInterval(this.pingTimer);
		clearTimeout(this.connectTimer);
		clearTimeout(this.retryTimer);
		this.pendingPing = undefined;
		this.generation++;
		const socket = this.socket;
		this.socket = undefined;
		socket?.close(1000, 'Left lobby');
	}
}
