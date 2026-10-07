import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const sockets = [];
function upgradeStatus(path, protocol, origin) {
	const url = new URL(`${base}${path}`);
	return new Promise((resolve, reject) => {
		const transport = url.protocol === 'https:' ? https : http;
		const request = transport.request(
			url,
			{
				headers: {
					Connection: 'Upgrade',
					Upgrade: 'websocket',
					'Sec-WebSocket-Version': '13',
					'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
					'Sec-WebSocket-Protocol': protocol,
					...(origin ? { Origin: origin } : {}),
				},
			},
			(response) => {
				response.resume();
				resolve(response.statusCode);
			}
		);
		request.on('upgrade', (_response, socket) => {
			socket.destroy();
			reject(new Error('Unexpected upgrade acceptance'));
		});
		request.on('error', reject);
		request.setTimeout(8000, () => request.destroy(new Error('Upgrade timeout')));
		request.end();
	});
}
async function request(path, method = 'GET', expected = 200, origin) {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: origin ? { Origin: origin } : {},
	});
	assert.equal(
		response.status,
		expected,
		`HTTP ${method} ${path}: expected ${expected}, got ${response.status}`
	);
	return response.status === 204 ? null : response.json();
}
async function waitFor(messages, predicate, from = 0) {
	const deadline = Date.now() + 8000;
	while (Date.now() < deadline) {
		const match = messages.slice(from).find(predicate);
		if (match) return match;
		await delay(20);
	}
	throw new Error('Timed out waiting for lobby event');
}
async function connect(credential) {
	const url = new URL(`${base}/rooms/${credential.roomId}/ws`);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	const ws = new WebSocket(url, ['worms-lobby-v1', `seat.${credential.token}`]);
	sockets.push(ws);
	const messages = [];
	ws.addEventListener('message', (event) => messages.push(JSON.parse(event.data)));
	// Do not log URLs, headers or credentials on failure.
	ws.addEventListener('error', () => {});
	const connected = await waitFor(messages, (message) => message.type === 'CONNECTED');
	assert.equal(connected.seat, credential.seat);
	return { ws, messages };
}
const ready = (message) => message.type === 'ROOM_STATE' && message.state.ready;
async function pair() {
	const hostCredential = await request('/rooms', 'POST', 201);
	const host = await connect(hostCredential);
	const guestCredential = await request(`/rooms/${hostCredential.roomId}/join`, 'POST');
	assert.notEqual(hostCredential.token, guestCredential.token);
	const guest = await connect(guestCredential);
	for (const connection of [host, guest]) {
		const message = await waitFor(connection.messages, ready);
		assert.equal(message.state.roomId, hostCredential.roomId);
		assert.equal(message.state.full, true);
		assert.equal(message.state.hostConnected, true);
		assert.equal(message.state.guestConnected, true);
		assert.ok(!JSON.stringify(connection.messages).includes(hostCredential.token));
		assert.ok(!JSON.stringify(connection.messages).includes(guestCredential.token));
	}
	return { host, guest, hostCredential, guestCredential };
}
try {
	assert.equal((await request('/health')).ok, true);
	await request('/health', 'GET', 200, 'https://ragna13377.github.io');
	await request('/health', 'GET', 200, 'http://localhost:3000');
	await request('/health', 'GET', 403, 'https://untrusted.example');
	const a = await pair();
	a.host.ws.send(JSON.stringify({ type: 'PING_PEER', value: 'hello from host' }));
	await waitFor(
		a.guest.messages,
		(m) => m.type === 'PEER_MESSAGE' && m.from === 'HOST' && m.value === 'hello from host'
	);
	a.guest.ws.send(JSON.stringify({ type: 'PING_PEER', value: 'hello from guest' }));
	await waitFor(
		a.host.messages,
		(m) => m.type === 'PEER_MESSAGE' && m.from === 'GUEST' && m.value === 'hello from guest'
	);
	const full = await request(`/rooms/${a.hostCredential.roomId}/join`, 'POST', 409);
	assert.equal(full.error.code, 'ROOM_FULL');
	const b = await pair();
	assert.notEqual(a.hostCredential.roomId, b.hostCredential.roomId);
	const aIndex = a.host.messages.length;
	a.host.ws.send(JSON.stringify({ type: 'PING_PEER', value: 'room A only' }));
	await waitFor(a.guest.messages, (m) => m.type === 'PEER_MESSAGE' && m.value === 'room A only');
	b.guest.ws.send(JSON.stringify({ type: 'PING_PEER', value: 'room B only' }));
	await waitFor(b.host.messages, (m) => m.type === 'PEER_MESSAGE' && m.value === 'room B only');
	await delay(250);
	for (const connection of [b.host, b.guest])
		assert.ok(!connection.messages.some((m) => m.value === 'room A only'));
	for (const connection of [a.host, a.guest])
		assert.ok(!connection.messages.some((m) => m.value === 'room B only'));
	assert.ok(
		!a.host.messages
			.slice(aIndex)
			.some((m) => m.type === 'ROOM_STATE' && m.state.roomId !== a.hostCredential.roomId)
	);
	for (const raw of [
		'not json',
		'{"type":"UNKNOWN"}',
		'{"type":"PING_PEER","value":42}',
		'{"type":"PING_PEER","value":"x","extra":true}',
	]) {
		const from = a.host.messages.length;
		a.host.ws.send(raw);
		await waitFor(a.host.messages, (m) => m.type === 'ERROR' && m.code === 'INVALID_MESSAGE', from);
	}
	let from = a.host.messages.length;
	a.host.ws.send(new Uint8Array([1, 2, 3]));
	await waitFor(a.host.messages, (m) => m.type === 'ERROR' && m.code === 'INVALID_MESSAGE', from);
	// Same token replaces the old connection without freeing or allocating another seat.
	const replaced = new Promise((resolve) =>
		a.guest.ws.addEventListener('close', resolve, { once: true })
	);
	const replacement = await connect(a.guestCredential);
	await waitFor(replacement.messages, ready);
	await Promise.race([
		replaced,
		delay(8000).then(() => {
			throw new Error('Old socket was not replaced');
		}),
	]);
	await request(`/rooms/${a.hostCredential.roomId}/join`, 'POST', 409);
	from = a.host.messages.length;
	// No code produces received-only 1005; the server must still publish leave.
	replacement.ws.close();
	await waitFor(a.host.messages, (m) => m.type === 'PLAYER_LEFT' && m.seat === 'GUEST', from);
	await waitFor(
		a.host.messages,
		(m) => m.type === 'ROOM_STATE' && !m.state.guestConnected && !m.state.ready && m.state.full,
		from
	);
	await request(`/rooms/${a.hostCredential.roomId}/join`, 'POST', 409);
	const reconnected = await connect(a.guestCredential);
	await waitFor(reconnected.messages, ready);
	from = reconnected.messages.length;
	reconnected.ws.send('x'.repeat(1025));
	await waitFor(
		reconnected.messages,
		(m) => m.type === 'ERROR' && m.code === 'MESSAGE_TOO_LARGE',
		from
	);
	assert.equal(
		await upgradeStatus(`/rooms/${a.hostCredential.roomId}/ws`, 'worms-lobby-v1, seat.invalid'),
		401
	);
	assert.equal(
		await upgradeStatus(
			`/rooms/${b.hostCredential.roomId}/ws`,
			`worms-lobby-v1, seat.${a.hostCredential.token}`
		),
		401
	);
	assert.equal(
		await upgradeStatus(
			`/rooms/${a.hostCredential.roomId}/ws`,
			`worms-lobby-v1, seat.${a.hostCredential.token}`,
			'https://untrusted.example'
		),
		403
	);
	await request('/rooms/INVALID/join', 'POST', 400);
	console.log(
		`PASS ${base}: health, origins, two full isolated rooms, bidirectional messages, ROOM_FULL, malformed/binary/oversized messages, token isolation, replacement, leave and reconnect.`
	);
} finally {
	for (const ws of sockets)
		if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
}
