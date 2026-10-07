import { DurableObject } from 'cloudflare:workers';
import {
	MAX_MESSAGE_BYTES,
	parsePeerMessage,
	ROOM_ALPHABET,
	ROOM_ID_PATTERN,
	type Seat,
	type ServerMessage,
} from '../../src/shared/realtime/protocol';
import {
	claimGuest,
	isExpired,
	type Lobby,
	ROOM_LIFETIME_MS,
	roomState,
	seatForToken,
} from './lobby';

type Env = { ROOMS: DurableObjectNamespace<GameRoom> };
type Attachment = { seat: Seat; active: boolean };
const json = (data: unknown, status = 200) => Response.json(data, { status });
const error = (code: string, status: number) => json({ error: { code } }, status);
function randomToken() {
	return crypto.randomUUID() + crypto.randomUUID();
}
function randomRoomId() {
	// Rejection sampling avoids modulo bias for the readable alphabet.
	let id = '';
	while (id.length < 6) {
		const byte = crypto.getRandomValues(new Uint8Array(1))[0];
		if (byte < 256 - (256 % ROOM_ALPHABET.length)) id += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
	}
	return id;
}
function allowedOrigin(origin: string | null) {
	if (!origin) return true; // CLI clients still require a seat credential.
	if (origin === 'https://ragna13377.github.io') return true;
	try {
		const url = new URL(origin);
		return (
			['http:', 'https:'].includes(url.protocol) &&
			['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
			url.origin === origin
		);
	} catch {
		return false;
	}
}
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const origin = request.headers.get('Origin');
		if (!allowedOrigin(origin)) return error('ORIGIN_FORBIDDEN', 403);
		const url = new URL(request.url);
		let response: Response;
		if (request.method === 'OPTIONS') {
			response = new Response(null, { status: 204 });
		} else if (url.pathname === '/health' && request.method === 'GET') {
			response = json({ ok: true, service: 'worms-js-lobby' });
		} else if (url.pathname === '/rooms' && request.method === 'POST') {
			response = error('ROOM_ID_COLLISION', 503);
			for (let attempt = 0; attempt < 5; attempt++) {
				const roomId = randomRoomId();
				response = await env.ROOMS.getByName(roomId).fetch(
					new Request(`https://room/${roomId}/create`, { method: 'POST' })
				);
				if (response.status !== 409) break;
			}
		} else {
			const match = /^\/rooms\/([^/]+)\/(join|ws)$/.exec(url.pathname);
			if (!match) response = error('NOT_FOUND', 404);
			else if (!ROOM_ID_PATTERN.test(match[1])) response = error('INVALID_ROOM_ID', 400);
			else if (
				(match[2] === 'join' && request.method !== 'POST') ||
				(match[2] === 'ws' && request.method !== 'GET')
			) {
				response = error('INVALID_REQUEST', 400);
			} else {
				response = await env.ROOMS.getByName(match[1]).fetch(
					new Request(`https://room/${match[1]}/${match[2]}${url.search}`, request)
				);
			}
		}
		if (response.status === 101) return response;
		const headers = new Headers(response.headers);
		if (origin) headers.set('Access-Control-Allow-Origin', origin);
		headers.set('Vary', 'Origin');
		headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		headers.set('Cache-Control', 'no-store');
		return new Response(response.body, { status: response.status, headers });
	},
} satisfies ExportedHandler<Env>;

export class GameRoom extends DurableObject<Env> {
	private attachment(ws: WebSocket): Attachment {
		return ws.deserializeAttachment() as Attachment;
	}
	private sockets() {
		return this.ctx
			.getWebSockets()
			.filter((ws) => this.attachment(ws)?.active && ws.readyState === WebSocket.OPEN);
	}
	private send(ws: WebSocket, message: ServerMessage) {
		ws.send(JSON.stringify(message));
	}
	private broadcast(message: ServerMessage) {
		for (const ws of this.sockets()) this.send(ws, message);
	}
	private publish(lobby: Lobby) {
		this.broadcast({
			type: 'ROOM_STATE',
			state: roomState(
				lobby,
				this.sockets().map((ws) => this.attachment(ws).seat)
			),
		});
	}
	private async expire() {
		for (const ws of this.sockets()) {
			this.send(ws, { type: 'ERROR', code: 'ROOM_EXPIRED' });
			ws.serializeAttachment({ ...this.attachment(ws), active: false });
			ws.close(1000, 'Room expired');
		}
		await this.ctx.storage.deleteAll();
		await this.ctx.storage.deleteAlarm();
	}
	private async liveLobby() {
		const lobby = await this.ctx.storage.get<Lobby>('lobby');
		if (lobby && isExpired(lobby)) {
			await this.expire();
			return undefined;
		}
		return lobby;
	}
	async fetch(request: Request): Promise<Response> {
		// Serialize reservations/upgrades, including all storage awaits and reconnect replacement.
		return this.ctx.blockConcurrencyWhile(async () => {
			const url = new URL(request.url);
			const [, roomId, action] = url.pathname.split('/');
			let lobby = await this.liveLobby();
			if (action === 'create') {
				if (lobby) return error('ROOM_EXISTS', 409);
				lobby = { roomId, hostToken: randomToken(), expiresAt: Date.now() + ROOM_LIFETIME_MS };
				await this.ctx.storage.put('lobby', lobby);
				await this.ctx.storage.setAlarm(lobby.expiresAt);
				return json({ roomId, token: lobby.hostToken, seat: 'HOST' }, 201);
			}
			if (!lobby) return error('ROOM_NOT_FOUND', 404);
			if (action === 'join') {
				const updated = claimGuest(lobby, randomToken());
				if (!updated) return error('ROOM_FULL', 409);
				await this.ctx.storage.put('lobby', updated);
				this.publish(updated);
				return json({ roomId, token: updated.guestToken, seat: 'GUEST' });
			}
			if (action !== 'ws' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
				return error('INVALID_REQUEST', 400);
			// Browser WebSockets cannot set Authorization. The credential is supplied as a
			// subprotocol, never in URLs, invite links or access-log query strings.
			const protocols =
				request.headers
					.get('Sec-WebSocket-Protocol')
					?.split(',')
					.map((s) => s.trim()) ?? [];
			const token = protocols.find((p) => p.startsWith('seat.'))?.slice(5) ?? null;
			const seat = seatForToken(lobby, token);
			if (!seat) return error('INVALID_TOKEN', 401);
			if (!protocols.includes('worms-lobby-v1')) return error('INVALID_PROTOCOL', 400);
			const wasConnected = this.sockets().some((ws) => this.attachment(ws).seat === seat);
			for (const ws of this.sockets()) {
				if (this.attachment(ws).seat === seat) {
					ws.serializeAttachment({ seat, active: false });
					ws.close(1000, 'Seat reconnected');
				}
			}
			const pair = new WebSocketPair();
			this.ctx.acceptWebSocket(pair[1]);
			pair[1].serializeAttachment({ seat, active: true } satisfies Attachment);
			this.send(pair[1], { type: 'CONNECTED', seat });
			if (!wasConnected) this.broadcast({ type: 'PLAYER_JOINED', seat });
			this.publish(lobby);
			return new Response(null, {
				status: 101,
				webSocket: pair[0],
				headers: { 'Sec-WebSocket-Protocol': 'worms-lobby-v1' },
			});
		});
	}
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const lobby = await this.liveLobby();
		if (!lobby || !this.attachment(ws)?.active) return;
		const size =
			typeof message === 'string'
				? new TextEncoder().encode(message).byteLength
				: message.byteLength;
		if (size > MAX_MESSAGE_BYTES) {
			this.send(ws, { type: 'ERROR', code: 'MESSAGE_TOO_LARGE' });
			ws.close(1009, 'Message too large');
			return;
		}
		const parsed = typeof message === 'string' ? parsePeerMessage(message) : null;
		if (!parsed) {
			this.send(ws, { type: 'ERROR', code: 'INVALID_MESSAGE' });
			return;
		}
		const seat = this.attachment(ws).seat;
		for (const peer of this.sockets()) {
			if (this.attachment(peer).seat !== seat)
				this.send(peer, { type: 'PEER_MESSAGE', from: seat, value: parsed.value });
		}
	}
	async webSocketClose(ws: WebSocket) {
		const attachment = this.attachment(ws);
		// A peer may close without a status (1005) or disappear (1006). Those
		// received-only codes cannot be echoed in a WebSocket close frame.
		ws.close(1000, 'Lobby connection closed');
		if (!attachment?.active) return;
		ws.serializeAttachment({ ...attachment, active: false });
		const lobby = await this.liveLobby();
		if (!lobby) return;
		if (this.sockets().some((socket) => this.attachment(socket).seat === attachment.seat)) return;
		this.broadcast({ type: 'PLAYER_LEFT', seat: attachment.seat });
		this.publish(lobby);
	}
	async webSocketError(ws: WebSocket) {
		await this.webSocketClose(ws);
	}
	async alarm() {
		const lobby = await this.ctx.storage.get<Lobby>('lobby');
		if (lobby && !isExpired(lobby)) await this.ctx.storage.setAlarm(lobby.expiresAt);
		else await this.expire();
	}
}
