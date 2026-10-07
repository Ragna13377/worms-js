import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const sockets = [];
async function post(path, status = 200) {
	const response = await fetch(`${base}${path}`, { method: 'POST' });
	assert.equal(response.status, status);
	return response.json();
}
async function connect(credential) {
	const url = new URL(`${base}/rooms/${credential.roomId}/ws`);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	const ws = new WebSocket(url, ['worms-lobby-v1', `seat.${credential.token}`]);
	sockets.push(ws);
	const messages = [];
	ws.onmessage = (e) => messages.push(JSON.parse(e.data));
	ws.onerror = () => {};
	const wait = async (type, predicate = () => true, from = 0) => {
		for (let i = 0; i < 500; i++) {
			const m = messages.slice(from).find((m) => m.type === type && predicate(m));
			if (m) return m;
			await delay(20);
		}
		throw new Error(`Timeout waiting for ${type}`);
	};
	await wait('CONNECTED');
	return { ws, messages, wait, send: (m) => ws.send(JSON.stringify(m)) };
}
try {
	await post('/rooms?roster=4', 400);
	const h = await post('/rooms?roster=2', 201),
		host = await connect(h);
	const original = (await host.wait('ROOM_STATE')).state.expiresAt;
	host.send({ type: 'START' });
	await host.wait('ERROR', (m) => m.code === 'START_FORBIDDEN');
	const g = await post(`/rooms/${h.roomId}/join`),
		guest = await connect(g);
	guest.send({ type: 'START' });
	await guest.wait('ERROR', (m) => m.code === 'START_FORBIDDEN');
	host.send({ type: 'START' });
	const prepare = await host.wait('MATCH_PREPARE'),
		config = prepare.config,
		matchId = config.matchId;
	assert.deepEqual((await guest.wait('MATCH_PREPARE')).config, config);
	assert.equal(config.roster, 2);
	assert.equal(config.worldWidth, 1280);
	assert.equal(config.worldHeight, 720);
	assert.ok(
		(await host.wait('ROOM_STATE', (m) => m.state.matchStarted)).state.expiresAt >= original
	);
	host.send({ type: 'START' });
	await host.wait('ERROR', (m) => m.code === 'START_FORBIDDEN', host.messages.length - 1);
	host.send({ type: 'MATCH_READY', matchId });
	await delay(50);
	assert.ok(!host.messages.some((m) => m.type === 'MATCH_GO'));
	guest.send({ type: 'MATCH_READY', matchId });
	await host.wait('MATCH_GO');
	await guest.wait('MATCH_GO');
	host.send({ type: 'PROGRESS', matchId, logicalTick: 40 });
	guest.send({ type: 'PROGRESS', matchId, logicalTick: 44 });
	await host.wait('PROGRESS', (m) => m.hostTick === 40 && m.guestTick === 44);
	const proposal = {
		type: 'INPUT_PROPOSE',
		matchId,
		clientSequence: 1,
		clientTick: 45,
		turnIndex: 0,
		change: { moveDirection: 1, commands: ['forwardJump'] },
	};
	guest.send(proposal);
	await guest.wait('ERROR', (m) => m.code === 'INPUT_FORBIDDEN');
	host.send(proposal);
	const commit = await host.wait('INPUT_COMMIT');
	assert.deepEqual(await guest.wait('INPUT_COMMIT'), commit);
	assert.equal(commit.effectiveTick, 57);
	assert.equal(commit.serverSequence, 1);
	host.send({ ...proposal, clientSequence: 2, change: { moveDirection: 0, commands: [] } });
	assert.equal((await host.wait('INPUT_COMMIT', (m) => m.serverSequence === 2)).effectiveTick, 69);
	const checkpoint = {
		type: 'CHECKPOINT',
		matchId,
		checkpointId: 'turn-1',
		logicalTick: 300,
		turnIndex: 1,
		hash: '12345678',
	};
	host.send(checkpoint);
	guest.send(checkpoint);
	await host.wait('CHECKPOINT_OK');
	await guest.wait('CHECKPOINT_OK');
	guest.send({ ...proposal, clientTick: 45, turnIndex: 1, change: { commands: ['grenade'] } });
	await host.wait('INPUT_COMMIT', (m) => m.seat === 'GUEST');
	host.send({ ...checkpoint, checkpointId: 'turn-2', turnIndex: 2, logicalTick: 600 });
	guest.send({
		...checkpoint,
		checkpointId: 'turn-2',
		turnIndex: 2,
		logicalTick: 600,
		hash: '87654321',
	});
	assert.equal((await host.wait('MATCH_STOP')).code, 'DESYNC');
	assert.equal((await guest.wait('MATCH_STOP')).code, 'DESYNC');
	const h2 = await post('/rooms?roster=1', 201),
		host2 = await connect(h2),
		g2 = await post(`/rooms/${h2.roomId}/join`),
		guest2 = await connect(g2);
	guest2.send({ type: 'LEAVE' });
	await host2.wait('ROOM_STATE', (m) => !m.state.full);
	await post(`/rooms/${h2.roomId}/join`);
	host2.send({ type: 'LEAVE' });
	await host2.wait('ERROR', (m) => m.code === 'ROOM_EXPIRED');
	await post(`/rooms/${h2.roomId}/join`, 404);
	console.log(
		`PASS ${base}: roster, host-only start, readiness, config, expiry extension, sequencing, ownership, checkpoints/DESYNC, explicit guest/host leave.`
	);
} finally {
	for (const ws of sockets) ws.close();
}
