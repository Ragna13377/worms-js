import { DurableObject } from 'cloudflare:workers';
import {
	MAX_MESSAGE_BYTES,
	parseClientMessage,
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

import {
	beginRecovery,
	type Coordinator,
	coordinate,
	prepareMatch,
	recoveryTimeout,
	stopMatch,
	suspendMatch,
} from './match';

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
		const roster = url.searchParams.get('roster') ?? '3';
		if (url.pathname === '/rooms' && !['1', '2', '3'].includes(roster))
			return error('INVALID_ROSTER', 400);
		if (request.method === 'OPTIONS') {
			response = new Response(null, { status: 204 });
		} else if (url.pathname === '/health' && request.method === 'GET') {
			response = json({ ok: true, service: 'worms-js-lobby' });
		} else if (url.pathname === '/rooms' && request.method === 'POST') {
			response = error('ROOM_ID_COLLISION', 503);
			for (let attempt = 0; attempt < 5; attempt++) {
				const roomId = randomRoomId();
				response = await env.ROOMS.getByName(roomId).fetch(
					new Request(`https://room/${roomId}/create?roster=${roster}`, { method: 'POST' })
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
	private matchCache?: Coordinator;
	private persistedSequence = 0;
	private async loadMatch() {
		if (this.matchCache) return this.matchCache;
		const stored = await this.ctx.storage.get<Coordinator>('match');
		if (!stored) return undefined;
		// Old deployed matches predate the committed log and cannot be replayed safely.
		if (stored.recoveryId === undefined) {
			stopMatch(stored, 'RECOVERY_FAILED');
			stored.history = [];
		} else if (!['ended', 'stopped'].includes(stored.phase))
			stored.history = [
				...(
					await this.ctx.storage.list<Coordinator['history'][number]>({ prefix: 'input:' })
				).values(),
			];
		else stored.history = [];
		this.persistedSequence = stored.serverSequence;
		this.matchCache = stored;
		return stored;
	}
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
	private async saveMatch(match: Coordinator, lobby: Lobby) {
		// Small metadata on progress; each committed event is written once, separately.
		const { history, ...metadata } = match;
		const entries: Record<string, unknown> = { match: metadata };
		for (const e of history)
			if (e.serverSequence > this.persistedSequence)
				entries[`input:${String(e.serverSequence).padStart(6, '0')}`] = e;
		await this.ctx.storage.put(entries);
		this.matchCache = match;
		this.persistedSequence = match.serverSequence;
		await this.ctx.storage.setAlarm(Math.min(lobby.expiresAt, match.deadline ?? lobby.expiresAt));
	}
	private async expire() {
		for (const ws of this.sockets()) {
			this.send(ws, { type: 'ERROR', code: 'ROOM_EXPIRED' });
			ws.serializeAttachment({ ...this.attachment(ws), active: false });
			ws.close(1000, 'Room expired');
		}
		await this.ctx.storage.deleteAll();
		this.matchCache = undefined;
		this.persistedSequence = 0;
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
				lobby = {
					roomId,
					hostToken: randomToken(),
					expiresAt: Date.now() + ROOM_LIFETIME_MS,
					roster: Number(url.searchParams.get('roster') ?? 3),
				};
				await this.ctx.storage.put('lobby', lobby);
				await this.ctx.storage.setAlarm(lobby.expiresAt);
				return json({ roomId, token: lobby.hostToken, seat: 'HOST' }, 201);
			}
			if (!lobby) return error('ROOM_NOT_FOUND', 404);
			if (action === 'join') {
				if (lobby.matchStarted) return error('MATCH_ALREADY_STARTED', 409);
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
			const match = await this.loadMatch();
			if (match) {
				const timedOut = recoveryTimeout(match);
				if (timedOut.length) {
					for (const m of timedOut) this.broadcast(m);
					await this.saveMatch(match, lobby);
				}
			}
			if (match && ['ended', 'stopped'].includes(match.phase)) return error('MATCH_FINISHED', 409);
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
			if (match) {
				// A new connection may arrive before the old close callback (page refresh).
				for (const m of suspendMatch(match, 'OPPONENT_DISCONNECTED')) this.broadcast(m);
				this.send(pair[1], { type: 'MATCH_PREPARE', config: match.config, recovering: true });
				if (this.sockets().length === 2) for (const m of beginRecovery(match)) this.broadcast(m);
				await this.saveMatch(match, lobby);
			}
			return new Response(null, {
				status: 101,
				webSocket: pair[0],
				headers: { 'Sec-WebSocket-Protocol': 'worms-lobby-v1' },
			});
		});
	}
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		return this.ctx.blockConcurrencyWhile(async () => {
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
			const parsed = typeof message === 'string' ? parseClientMessage(message) : null;
			if (!parsed) {
				this.send(ws, { type: 'ERROR', code: 'INVALID_MESSAGE' });
				return;
			}
			const seat = this.attachment(ws).seat;
			if (parsed.type === 'PING') {
				this.send(ws, { type: 'PONG', id: parsed.id });
				return;
			}
			if (parsed.type === 'LEAVE') {
				if (seat === 'HOST' && !lobby.matchStarted) {
					await this.expire();
					return;
				}
				if (!lobby.matchStarted) {
					delete lobby.guestToken;
					await this.ctx.storage.put('lobby', lobby);
				}
				const match = await this.loadMatch();
				if (match && !['ended', 'stopped'].includes(match.phase)) {
					for (const m of stopMatch(match, 'OPPONENT_LEFT')) this.broadcast(m);
					await this.saveMatch(match, lobby);
				}
				ws.serializeAttachment({ seat, active: false });
				ws.close(1000, 'Player left');
				this.broadcast({ type: 'PLAYER_LEFT', seat });
				this.publish(lobby);
				return;
			}
			if (parsed.type === 'PING_PEER') {
				for (const peer of this.sockets())
					if (this.attachment(peer).seat !== seat)
						this.send(peer, { type: 'PEER_MESSAGE', from: seat, value: parsed.value });
				return;
			}
			if (parsed.type === 'START') {
				if (
					seat !== 'HOST' ||
					lobby.matchStarted ||
					!roomState(
						lobby,
						this.sockets().map((s) => this.attachment(s).seat)
					).ready
				) {
					this.send(ws, { type: 'ERROR', code: 'START_FORBIDDEN' });
					return;
				}
				const match = prepareMatch(lobby.roster ?? 3);
				lobby.matchStarted = true;
				lobby.expiresAt = Date.now() + ROOM_LIFETIME_MS;
				await this.ctx.storage.put({ lobby, match });
				this.matchCache = match;
				this.persistedSequence = 0;
				await this.ctx.storage.setAlarm(lobby.expiresAt);
				this.publish(lobby);
				this.broadcast({ type: 'MATCH_PREPARE', config: match.config });
				return;
			}
			const match = await this.loadMatch();
			if (!match) {
				this.send(ws, { type: 'ERROR', code: 'INVALID_MATCH' });
				return;
			}
			try {
				const messages = coordinate(match, seat, parsed);
				await this.saveMatch(match, lobby);
				for (const m of messages) this.broadcast(m);
			} catch (e) {
				this.send(ws, { type: 'ERROR', code: e instanceof Error ? e.message : 'INVALID_MESSAGE' });
			}
		});
	}
	async webSocketClose(ws: WebSocket) {
		return this.ctx.blockConcurrencyWhile(() => this.closeSocket(ws));
	}
	private async closeSocket(ws: WebSocket) {
		const attachment = this.attachment(ws);
		// A peer may close without a status (1005) or disappear (1006). Those
		// received-only codes cannot be echoed in a WebSocket close frame.
		ws.close(1000, 'Lobby connection closed');
		if (!attachment?.active) return;
		ws.serializeAttachment({ ...attachment, active: false });
		const lobby = await this.liveLobby();
		if (!lobby) return;
		if (this.sockets().some((socket) => this.attachment(socket).seat === attachment.seat)) return;
		const match = await this.loadMatch();
		if (match && !['ended', 'stopped'].includes(match.phase)) {
			for (const m of suspendMatch(match, 'OPPONENT_DISCONNECTED')) this.broadcast(m);
			await this.saveMatch(match, lobby);
		}
		this.broadcast({ type: 'PLAYER_LEFT', seat: attachment.seat });
		this.publish(lobby);
	}
	async webSocketError(ws: WebSocket) {
		await this.webSocketClose(ws);
	}
	async alarm() {
		return this.ctx.blockConcurrencyWhile(async () => {
			const lobby = await this.liveLobby();
			if (!lobby) return;
			const match = await this.loadMatch();
			if (match) {
				for (const m of recoveryTimeout(match)) this.broadcast(m);
				await this.saveMatch(match, lobby);
			} else await this.ctx.storage.setAlarm(lobby.expiresAt);
		});
	}
}
