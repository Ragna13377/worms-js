import { afterEach, expect, it, vi } from 'vitest';
import { LobbyClient } from '../src/shared/realtime/client';
import { OnlineMatch } from '../src/shared/realtime/onlineMatch';
import {
	ONLINE,
	type OnlineConfig,
	type Seat,
	type ServerMessage,
} from '../src/shared/realtime/protocol';
import { stateHash } from '../src/shared/realtime/stateHash';

const config: OnlineConfig = {
	matchId: '00000000-0000-4000-8000-000000000000',
	seed: 7,
	roster: 2,
	worldWidth: 1280,
	worldHeight: 720,
};
function fixture(seat: Seat) {
	const client = new LobbyClient();
	let receive: (m: ServerMessage) => void = () => {};
	vi.spyOn(client, 'onMessage').mockImplementation((listener) => {
		receive = listener;
		return () => {};
	});
	const send = vi.spyOn(client, 'send').mockImplementation(() => {});
	const match = new OnlineMatch(client, config, seat);
	match.ready();
	receive({ type: 'MATCH_GO', matchId: config.matchId });
	const confirm = () =>
		receive({
			type: 'CHECKPOINT_OK',
			matchId: config.matchId,
			checkpointId: 'initial',
			logicalTick: 0,
			turnIndex: 0,
			hash: match.checkpointHash,
		});
	return { match, send, receive, confirm };
}
afterEach(() => vi.restoreAllMocks());
it('HOST originates RED; GUEST cannot originate RED but executes its remote committed input', () => {
	const host = fixture('HOST'),
		guest = fixture('GUEST');
	host.confirm();
	guest.confirm();
	expect(host.match.canSubmit).toBe(true);
	expect(guest.match.canSubmit).toBe(false);
	guest.match.propose({ moveDirection: 1, commands: ['grenade'] });
	expect(guest.send.mock.calls.filter(([m]) => m.type === 'INPUT_PROPOSE')).toHaveLength(0);
	host.match.propose({ moveDirection: 0, commands: ['grenade'] });
	expect(host.send.mock.calls.filter(([m]) => m.type === 'INPUT_PROPOSE')).toHaveLength(1);
	const commit = {
		type: 'INPUT_COMMIT' as const,
		matchId: config.matchId,
		serverSequence: 1,
		effectiveTick: 3,
		seat: 'HOST' as const,
		turnIndex: 0,
		change: { commands: ['grenade' as const] },
	};
	for (const f of [host, guest]) {
		f.receive(commit);
		f.match.advance(0.1);
		expect(f.match.simulation.game.weapon.selectedWeapon).toBe('grenade');
	}
	expect(stateHash(host.match.simulation.game, host.match.simulation.world, 6)).toBe(
		stateHash(guest.match.simulation.game, guest.match.simulation.world, 6)
	);
	for (const f of [host, guest]) {
		f.match.simulation.game.match.activeWormId = 'BLUE-1';
		f.match.simulation.game.match.turnIndex = 1;
	}
	expect(host.match.canSubmit).toBe(false);
	expect(guest.match.canSubmit).toBe(true);
});
it('neutralization goes through proposals and never mutates local charge/authoritative state', () => {
	const f = fixture('HOST');
	f.confirm();
	f.match.simulation.game.weapon.isCharging = true;
	const before = stateHash(f.match.simulation.game, f.match.simulation.world, 0);
	f.match.menuOpen = true;
	f.match.neutralize();
	expect(f.send.mock.calls.at(-1)?.[0]).toMatchObject({
		type: 'INPUT_PROPOSE',
		change: { commands: ['cancelCharge'] },
	});
	expect(stateHash(f.match.simulation.game, f.match.simulation.world, 0)).toBe(before);
	expect(f.match.simulation.game.paused).toBe(false);
});
it.each([false, true])(
	'bounds missing initial/final checkpoints despite repeated unchanged progress (end=%s)',
	(ended) => {
		let now = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		const f = fixture('HOST');
		if (ended) f.match.simulation.game.match.turnState = 'MATCH_END';
		for (let i = 0; i < 20; i++) {
			now += 1000;
			f.receive({ type: 'PROGRESS', matchId: config.matchId, hostTick: 0, guestTick: 0 });
			f.match.advance(0.016);
		}
		expect(f.match.status).toBe('resynchronizing');
		expect(f.match.error).toBeUndefined();
		expect(f.send.mock.calls.filter(([m]) => m.type === 'MATCH_FAIL')).toHaveLength(1);
		expect(f.send.mock.calls.at(-1)?.[0]).toMatchObject({
			type: 'MATCH_FAIL',
			code: 'PEER_TIMEOUT',
		});
	}
);
it('freezes on late commits and bounds catchup rather than applying input late', () => {
	const f = fixture('HOST');
	f.confirm();
	f.match.advance(0.1);
	const tick = f.match.timeline.tick;
	f.receive({
		type: 'INPUT_COMMIT',
		matchId: config.matchId,
		serverSequence: 1,
		effectiveTick: 0,
		seat: 'HOST',
		turnIndex: 0,
		change: { commands: ['fire'] },
	});
	f.match.advance(1);
	expect(f.match.status).toBe('resynchronizing');
	expect(f.send.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'MATCH_FAIL', code: 'LATE_INPUT' });
	expect(f.match.timeline.tick).toBe(tick);
	const slow = fixture('HOST');
	slow.confirm();
	slow.match.advance((ONLINE.maxBehind + 1) / 60);
	expect(slow.match.status).toBe('resynchronizing');
	expect(slow.match.timeline.tick).toBe(0);
	expect(slow.send.mock.calls.at(-1)?.[0]).toMatchObject({
		type: 'MATCH_FAIL',
		code: 'SIMULATION_BEHIND',
	});
});
it('rebuilds corrupted state, keeps the barrier until GO, and resumes without re-sending initial readiness', async () => {
	const f = fixture('HOST');
	f.confirm();
	const original = f.match.checkpointHash;
	f.match.simulation.game.worms[0].hp--;
	f.match.fail('DESYNC');
	expect(f.match.canSubmit).toBe(false);
	f.receive({
		type: 'RECOVERY_BEGIN',
		matchId: config.matchId,
		recoveryId: 1,
		targetTick: 0,
		serverSequence: 0,
		clientSequences: { HOST: 0, GUEST: 0 },
		eventCount: 0,
	});
	f.receive({ type: 'RECOVERY_REPLAY', matchId: config.matchId, recoveryId: 1 });
	await vi.waitFor(() =>
		expect(f.send.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'RECOVERY_READY', hash: original })
	);
	expect(f.match.status).toBe('restoringMatch');
	expect(f.match.canSubmit).toBe(false);
	f.match.ready();
	expect(f.send.mock.calls.filter(([m]) => m.type === 'MATCH_READY')).toHaveLength(1);
	f.receive({
		type: 'RECOVERY_GO',
		matchId: config.matchId,
		recoveryId: 1,
		targetTick: 0,
		ended: false,
	});
	expect(f.match.canSubmit).toBe(true);
	f.match.propose({ moveDirection: 0, commands: [] });
	expect(f.send.mock.calls.at(-1)?.[0]).toMatchObject({
		type: 'INPUT_PROPOSE',
		change: { moveDirection: 0, aimDirection: 0 },
	});
});
it('fatal server DESYNC ends recovery without requesting another loop', () => {
	const f = fixture('GUEST');
	f.receive({ type: 'MATCH_STOP', matchId: config.matchId, code: 'DESYNC' });
	expect(f.match.error).toBe('DESYNC');
	expect(f.send.mock.calls.filter(([m]) => m.type === 'MATCH_FAIL')).toHaveLength(0);
});
it('keeps the normal outro running after a slow frame following confirmed match end', () => {
	const f = fixture('HOST');
	f.confirm();
	f.match.simulation.game.match.matchTimeRemaining = 0;
	for (let i = 0; i < 600 && f.match.simulation.game.match.turnState !== 'MATCH_END'; i++) {
		f.receive({
			type: 'PROGRESS',
			matchId: config.matchId,
			hostTick: f.match.timeline.tick,
			guestTick: f.match.timeline.tick,
		});
		f.match.advance(1 / 60);
	}
	const checkpoint = f.send.mock.calls.at(-1)?.[0];
	if (checkpoint?.type !== 'CHECKPOINT') throw new Error('Expected final checkpoint');
	expect(checkpoint.checkpointId).toBe('end');
	f.receive({ ...checkpoint, type: 'CHECKPOINT_OK' });
	const tick = f.match.timeline.tick;
	f.match.advance(10);
	expect(f.match.checkpointStatus).toBe('ended');
	expect(f.match.status).toBeUndefined();
	expect(f.match.timeline.tick).toBeGreaterThan(tick);
	expect(f.send.mock.calls.filter(([m]) => m.type === 'MATCH_FAIL')).toHaveLength(0);
});
