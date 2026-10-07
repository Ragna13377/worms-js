import { afterEach, expect, it, vi } from 'vitest';
import { beginRecovery, coordinate, prepareMatch } from '../realtime/src/match';
import { LobbyClient } from '../src/shared/realtime/client';
import { OnlineMatch } from '../src/shared/realtime/onlineMatch';
import { PeerLatency, type PeerMessage, type PeerTransport } from '../src/shared/realtime/peer';
import type { ClientMessage, Seat, ServerMessage } from '../src/shared/realtime/protocol';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
function pair() {
	let now = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	const coordinator = prepareMatch(2);
	coordinator.config.seed = 7;
	const messages: { seat: Seat; m: ClientMessage }[] = [],
		packets: { seat: Seat; m: PeerMessage }[] = [];
	const createFixture = (seat: Seat, recovering = false, direct = true) => {
		const client = new LobbyClient();
		let receive: (m: ServerMessage) => void = () => {},
			receivePeer: (m: PeerMessage) => void = () => {};
		vi.spyOn(client, 'onMessage').mockImplementation((f) => {
			receive = f;
			return () => {};
		});
		vi.spyOn(client, 'onPeerMessage').mockImplementation((f) => {
			receivePeer = f;
			return () => {};
		});
		vi.spyOn(client, 'send').mockImplementation((m) => {
			messages.push({ seat, m });
		});
		const latency = new PeerLatency();
		latency.observe(2);
		const match = new OnlineMatch(client, coordinator.config, seat, recovering);
		if (!recovering) match.ready();
		client.peer = {
			state: direct ? 'p2p' : 'websocket-fallback',
			latency,
			wait: () => Promise.resolve(),
			send: (m: PeerMessage) => {
				packets.push({ seat, m });
				return true;
			},
		} as PeerTransport;
		return { client, match, receive, receivePeer };
	};
	const fixtures = (['HOST', 'GUEST'] as const).map((seat) => createFixture(seat));
	const [host, guest] = fixtures;
	const broadcast = (m: ServerMessage) => {
		for (const f of fixtures) f.receive(m);
	};
	const server = () => {
		for (let n = 0; messages.length && n < 1000; n++) {
			const next = messages.shift();
			if (!next) break;
			const { seat, m } = next;
			for (const response of coordinate(coordinator, seat, m)) broadcast(response);
		}
	};
	const peer = () => {
		for (const { seat, m } of packets.splice(0)) fixtures[seat === 'HOST' ? 1 : 0].receivePeer(m);
	};
	server();
	coordinator.direct = true;
	coordinator.authorSequencing = true;
	for (const f of fixtures)
		f.receive({ type: 'MATCH_GO', matchId: coordinator.config.matchId, direct: true });
	const step = (count = 1, cloud = true, delta = 1 / 60) => {
		for (let i = 0; i < count; i++) {
			now += delta * 1000;
			for (const f of fixtures) f.match.advance(delta);
			peer();
			if (cloud) server();
		}
	};
	const refresh = (seat: Seat, direct: boolean) => {
		const index = seat === 'HOST' ? 0 : 1;
		fixtures[index].match.dispose();
		fixtures[index] = createFixture(seat, true, direct);
		const survivor = fixtures[1 - index];
		survivor.client.peer = {
			...survivor.client.peer,
			state: direct ? 'p2p' : 'websocket-fallback',
			wait: () => Promise.resolve(),
		} as PeerTransport;
	};
	return {
		host,
		guest,
		coordinator,
		fixtures,
		packets,
		messages,
		broadcast,
		server,
		peer,
		step,
		refresh,
	};
}
it.each(['HOST', 'GUEST'] as const)(
	'%s authors and applies direct movement/aim/fire without any Cloudflare response',
	(seat) => {
		const p = pair();
		if (seat === 'GUEST')
			for (const f of p.fixtures) {
				f.match.simulation.game.match.activeWormId = 'BLUE-1';
				f.match.simulation.game.match.turnIndex = 1;
			}
		const owner = seat === 'HOST' ? p.host : p.guest;
		owner.match.propose({
			moveDirection: 1,
			aimDirection: 1,
			commands: ['grenade', 'fuse2', 'chargeStart'],
		});
		expect(owner.match.timeline.lastSequence).toBe(1);
		expect(owner.match.delayTicks).toBe(2);
		expect(p.messages.some(({ m }) => m.type === 'INPUT_PROPOSE')).toBe(false);
		p.peer();
		p.step(6, false);
		expect(owner.match.timeline.tick).toBeGreaterThan(2);
		expect(owner.match.simulation.game.weapon.selectedWeapon).toBe('grenade');
		expect(owner.match.simulation.game.weapon.grenadeFuse).toBe(2);
		owner.match.propose({ moveDirection: 0, aimDirection: 0, commands: ['fire'] });
		p.peer();
		p.step(6, false);
		expect(owner.match.timeline.lastSequence).toBe(2);
		expect(owner.match.simulation.game.nextProjectileId).toBeGreaterThan(1);
		for (const f of p.fixtures) expect(f.match.status).toBeUndefined();
		for (const f of p.fixtures) f.match.dispose();
	}
);
it('direct pacing ignores stale Cloudflare progress; both owners hand off with identical hashes and persisted deterministic log', () => {
	const p = pair(),
		turns = new Set<Seat>(),
		terrain = p.host.match.simulation.world.terrain.exportCells();
	let previousTurn = -1,
		controlled = 0;
	for (let i = 0; (i < 7000 && turns.size < 2) || (i < 7000 && p.coordinator.turnIndex < 2); i++) {
		const turn = p.host.match.simulation.game.match.turnIndex;
		if (turn !== previousTurn) {
			previousTurn = turn;
			controlled = 0;
		}
		const seat = turn % 2 === 0 ? 'HOST' : 'GUEST',
			f = seat === 'HOST' ? p.host : p.guest;
		if (f.match.canSubmit) {
			turns.add(seat);
			if (controlled === 5)
				f.match.propose({
					moveDirection: 1,
					aimDirection: 1,
					commands: [seat === 'HOST' ? 'grenade' : 'bazooka'],
				});
			if (controlled === 15) f.match.propose({ moveDirection: 0, aimDirection: 0, commands: [] });
			if (controlled === 100)
				f.match.propose({ moveDirection: 0, commands: ['fuse1', 'chargeStart'] });
			if (controlled === 120) f.match.propose({ moveDirection: 0, commands: ['fire'] });
			controlled++;
		}
		p.peer();
		p.step();
		p.broadcast({
			type: 'PROGRESS',
			matchId: p.coordinator.config.matchId,
			hostTick: 0,
			guestTick: 0,
		});
		for (const f of p.fixtures) {
			expect(f.match.error).toBeUndefined();
			expect(f.match.status).toBeUndefined();
		}
	}
	expect(turns).toEqual(new Set(['HOST', 'GUEST']));
	expect(p.coordinator.turnIndex).toBeGreaterThanOrEqual(2);
	expect(p.host.match.checkpointHash).toBe(p.guest.match.checkpointHash);
	expect(p.coordinator.history.length).toBeGreaterThanOrEqual(8);
	expect(p.host.match.diagnostics().persistedSequence).toBe(p.coordinator.serverSequence);
	expect(p.host.match.simulation.world.terrain.exportCells()).not.toEqual(terrain);
	for (const f of p.fixtures) f.match.dispose();
});
it('catch-up batches release the follower through turn boundaries without accumulating pacing debt', () => {
	const p = pair();
	for (let i = 0; i < 1300 && p.coordinator.turnIndex < 2; i++) {
		p.step(1, true, 0.1);
		for (const f of p.fixtures) {
			expect(f.match.status).toBeUndefined();
			expect(f.match.error).toBeUndefined();
		}
	}
	expect(
		p.coordinator.turnIndex,
		JSON.stringify(
			p.fixtures.map((f) => ({ ...f.match.diagnostics(), turn: f.match.simulation.game.match }))
		)
	).toBe(2);
	expect(p.host.match.checkpointHash).toBe(p.guest.match.checkpointHash);
	for (const f of p.fixtures) f.match.dispose();
});
it('missing persistence ACK causes resend and blocks checkpoint until the tail is drained', () => {
	const p = pair();
	p.host.match.propose({ moveDirection: 1, commands: [] });
	p.peer();
	p.step(35, false);
	expect(p.messages.filter(({ m }) => m.type === 'INPUT_MIRROR').length).toBeGreaterThan(2);
	expect(p.host.match.diagnostics().persistedSequence).toBe(0);
	p.server();
	expect(p.coordinator.history).toHaveLength(1);
	expect(p.host.match.diagnostics().persistedSequence).toBe(1);
	for (const f of p.fixtures) f.match.dispose();
});
it('recovery flush refuses to replay until both peers report and the missing mirror tail is persisted', () => {
	const p = pair();
	p.host.match.propose({ moveDirection: 1, commands: [] });
	p.peer();
	expect(beginRecovery(p.coordinator)[0].type).toBe('RECOVERY_FLUSH');
	const matchId = p.coordinator.config.matchId;
	expect(
		coordinate(p.coordinator, 'HOST', { type: 'FLUSH_READY', matchId, serverSequence: 1 })
	).toEqual([]);
	expect(
		coordinate(p.coordinator, 'GUEST', { type: 'FLUSH_READY', matchId, serverSequence: 1 })
	).toEqual([]);
	const mirror = p.messages.find(({ m }) => m.type === 'INPUT_MIRROR')?.m;
	if (!mirror) throw new Error('missing mirrored commit');
	expect(coordinate(p.coordinator, 'GUEST', mirror)[0].type).toBe('MIRROR_ACK');
	expect(
		coordinate(p.coordinator, 'HOST', { type: 'FLUSH_READY', matchId, serverSequence: 1 })[0]
	).toMatchObject({ type: 'RECOVERY_BEGIN', serverSequence: 1 });
	for (const f of p.fixtures) f.match.dispose();
});
it.each([
	['HOST', true],
	['GUEST', true],
	['HOST', false],
	['GUEST', false],
] as const)(
	'%s refresh drains the tail, deterministically replays and resumes (new direct=%s)',
	async (seat, direct) => {
		const p = pair();
		p.host.match.propose({ moveDirection: 1, commands: ['grenade'] });
		p.peer();
		p.step(12, false);
		p.refresh(seat, direct);
		for (const message of beginRecovery(p.coordinator)) p.broadcast(message);
		p.server();
		expect(p.coordinator.phase).toBe('recovering');
		await vi.waitFor(() => {
			p.server();
			expect(p.coordinator.phase).toBe('playing');
		});
		const [a, b] = p.fixtures;
		expect(a.match.checkpointHash).toBe(b.match.checkpointHash);
		expect(a.match.timeline.lastSequence).toBe(1);
		expect(b.match.timeline.lastSequence).toBe(1);
		expect(p.coordinator.history).toHaveLength(1);
		for (const f of p.fixtures) {
			expect(f.match.diagnostics().transport).toBe(direct ? 'p2p' : 'websocket-fallback');
			expect(f.match.status).toBeUndefined();
			expect(f.match.error).toBeUndefined();
		}
		p.step(12);
		expect(a.match.timeline.tick).toBeGreaterThan(0);
		expect(b.match.timeline.tick).toBeGreaterThan(0);
		for (const f of p.fixtures) f.match.dispose();
	}
);
