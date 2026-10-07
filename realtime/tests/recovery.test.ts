import { expect, it } from 'vitest';
import { ONLINE, parseClientMessage, type Seat } from '../../src/shared/realtime/protocol';
import {
	beginRecovery,
	coordinate,
	prepareMatch,
	recoveryTimeout,
	stopMatch,
	suspendMatch,
} from '../src/match';

function playing() {
	const m = prepareMatch(1);
	for (const seat of ['HOST', 'GUEST'] as Seat[])
		coordinate(m, seat, { type: 'MATCH_READY', matchId: m.config.matchId });
	return m;
}
function ready(m: ReturnType<typeof playing>, seat: Seat, hash = '12345678') {
	return coordinate(m, seat, {
		type: 'RECOVERY_READY',
		matchId: m.config.matchId,
		recoveryId: m.recoveryId,
		targetTick: m.targetTick,
		hash,
		turnIndex: m.turnIndex,
		ended: false,
	});
}
it('persists committed history, server-selected target, sequences and recovery barrier across rehydration', () => {
	let m = playing();
	coordinate(m, 'HOST', { type: 'PROGRESS', matchId: m.config.matchId, logicalTick: 100 });
	coordinate(m, 'GUEST', { type: 'PROGRESS', matchId: m.config.matchId, logicalTick: 106 });
	coordinate(m, 'HOST', {
		type: 'INPUT_PROPOSE',
		matchId: m.config.matchId,
		clientSequence: 1,
		clientTick: 100,
		turnIndex: 0,
		change: { moveDirection: 1, commands: ['grenade'] },
	});
	expect(m.history[0]).toMatchObject({ serverSequence: 1, effectiveTick: 118, seat: 'HOST' });
	expect(suspendMatch(m, 'disconnect', 1000)[0].type).toBe('MATCH_SUSPENDED');
	expect(
		coordinate(m, 'HOST', { type: 'PROGRESS', matchId: m.config.matchId, logicalTick: 200 })
	).toEqual([]);
	m = JSON.parse(JSON.stringify(m));
	const bundle = beginRecovery(m, false, 2000);
	expect(bundle[0]).toMatchObject({
		type: 'RECOVERY_BEGIN',
		targetTick: 106,
		serverSequence: 1,
		eventCount: 1,
	});
	expect(bundle[1]).toMatchObject({ type: 'RECOVERY_LOG', offset: 0, events: m.history });
	expect(ready(m, 'HOST')).toEqual([]);
	expect(m.phase).toBe('recovering');
	expect(ready(m, 'GUEST')[0]).toMatchObject({ type: 'RECOVERY_GO', targetTick: 106 });
	expect(m.ticks).toEqual({ HOST: 106, GUEST: 106 });
	expect(m.clientSequences.HOST).toBe(1);
});
it('mismatched replay retries exactly twice and stops cleanly', () => {
	const m = playing();
	beginRecovery(m);
	ready(m, 'HOST');
	expect(ready(m, 'GUEST', '87654321')[0].type).toBe('RECOVERY_BEGIN');
	expect(m.recoveryAttempts).toBe(2);
	ready(m, 'HOST');
	expect(ready(m, 'GUEST', '87654321')[0]).toMatchObject({ type: 'MATCH_STOP', code: 'DESYNC' });
	expect(m.phase).toBe('stopped');
	expect(beginRecovery(m)).toEqual([]);
});
it('bounds repeated performance recovery separately from hash mismatch attempts', () => {
	const m = playing();
	for (let i = 0; i < ONLINE.maxRecoveries; i++) {
		beginRecovery(m);
		ready(m, 'HOST');
		ready(m, 'GUEST');
	}
	expect(beginRecovery(m)[0]).toMatchObject({ type: 'MATCH_STOP', code: 'RECOVERY_FAILED' });
});
it('disconnect grace cannot be extended, and explicit leave has no grace', () => {
	const m = playing();
	suspendMatch(m, 'disconnect', 1000);
	suspendMatch(m, 'disconnect', 2000);
	expect(m.deadline).toBe(1000 + ONLINE.reconnectGraceMs);
	expect(recoveryTimeout(m, m.deadline - 1)).toEqual([]);
	expect(recoveryTimeout(m, m.deadline)[0]).toMatchObject({
		type: 'MATCH_STOP',
		code: 'OPPONENT_DISCONNECTED',
	});
	const other = playing();
	stopMatch(other, 'OPPONENT_LEFT');
	expect(other.deadline).toBeUndefined();
});
it('stale readiness, wrong ticks and one seat alone cannot resume; rooms remain independent', () => {
	const a = playing(),
		b = playing();
	beginRecovery(a);
	expect(
		coordinate(a, 'HOST', {
			type: 'RECOVERY_READY',
			matchId: a.config.matchId,
			recoveryId: 0,
			targetTick: 0,
			hash: '12345678',
			turnIndex: 0,
			ended: false,
		})
	).toEqual([]);
	ready(a, 'GUEST');
	expect(a.phase).toBe('recovering');
	expect(b.phase).toBe('playing');
	expect(b.history).toEqual([]);
	expect(b.deadline).toBeUndefined();
});
it('normal final checkpoint ends the match and cannot start recovery', () => {
	const m = playing(),
		cp = {
			type: 'CHECKPOINT' as const,
			matchId: m.config.matchId,
			checkpointId: 'end',
			logicalTick: 36000,
			turnIndex: 0,
			hash: '12345678',
		};
	coordinate(m, 'HOST', cp);
	coordinate(m, 'GUEST', cp);
	expect(m.phase).toBe('ended');
	expect(suspendMatch(m, 'disconnect')).toEqual([]);
	expect(beginRecovery(m)).toEqual([]);
});
it('rejects malformed ping and recovery payloads with unchanged small client message bound', () => {
	expect(parseClientMessage('{"type":"PING","id":7}')).toEqual({ type: 'PING', id: 7 });
	for (const ping of [
		{ type: 'PING', id: -1 },
		{ type: 'PING', id: '1' },
		{ type: 'PING', id: 1, world: {} },
	])
		expect(parseClientMessage(JSON.stringify(ping))).toBeNull();
	expect(
		parseClientMessage(
			JSON.stringify({
				type: 'RECOVERY_READY',
				matchId: crypto.randomUUID(),
				recoveryId: 1,
				targetTick: ONLINE.maxMatchTicks + 1,
				hash: '12345678',
				turnIndex: 0,
				ended: false,
			})
		)
	).toBeNull();
});
