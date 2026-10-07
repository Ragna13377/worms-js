import { describe, expect, it } from 'vitest';
import { ONLINE, parseClientMessage } from '../../src/shared/realtime/protocol';
import { coordinate, prepareMatch } from '../src/match';

function playing() {
	const match = prepareMatch(2);
	coordinate(match, 'HOST', { type: 'MATCH_READY', matchId: match.config.matchId });
	expect(match.phase).toBe('preparing');
	expect(
		coordinate(match, 'GUEST', { type: 'MATCH_READY', matchId: match.config.matchId })[0].type
	).toBe('MATCH_GO');
	return match;
}
describe('match coordinator', () => {
	it.each(['HOST', 'GUEST'] as const)(
		'mixed versions preserve server sequencing regardless of last ready seat (%s)',
		(last) => {
			const m = prepareMatch(1),
				first = last === 'HOST' ? 'GUEST' : 'HOST',
				matchId = m.config.matchId;
			coordinate(m, first, {
				type: 'MATCH_READY',
				matchId,
				...(first === 'HOST' ? { direct: false } : {}),
			});
			const go = coordinate(m, last, {
				type: 'MATCH_READY',
				matchId,
				...(last === 'HOST' ? { direct: false } : {}),
			})[0];
			expect(go).toEqual({ type: 'MATCH_GO', matchId });
			expect(m.authorSequencing).toBe(false);
		}
	);
	it('generates unique configuration and waits for both readiness acknowledgements', () => {
		const m = playing(),
			other = prepareMatch(1);
		expect(m.config).toMatchObject({ roster: 2, worldWidth: 1280, worldHeight: 720 });
		expect(m.config.matchId).not.toBe(other.config.matchId);
		expect(Number.isInteger(m.config.seed)).toBe(true);
	});
	it('sequences future inputs using both progress reports and rejects wrong ownership / duplicate proposals', () => {
		const m = playing(),
			matchId = m.config.matchId;
		coordinate(m, 'HOST', { type: 'PROGRESS', matchId, logicalTick: 100 });
		coordinate(m, 'GUEST', { type: 'PROGRESS', matchId, logicalTick: 105 });
		const proposal = {
			type: 'INPUT_PROPOSE' as const,
			matchId,
			clientSequence: 1,
			clientTick: 101,
			turnIndex: 0,
			change: { moveDirection: 1 as const, commands: [] },
		};
		expect(() => coordinate(m, 'GUEST', proposal)).toThrow('INPUT_FORBIDDEN');
		expect(coordinate(m, 'HOST', proposal)[0]).toMatchObject({
			serverSequence: 1,
			effectiveTick: 105 + ONLINE.inputDelay,
		});
		expect(() => coordinate(m, 'HOST', proposal)).toThrow();
		expect(coordinate(m, 'HOST', { ...proposal, clientSequence: 2 })[0]).toMatchObject({
			serverSequence: 2,
			effectiveTick: 105 + ONLINE.inputDelay,
		});
	});
	it.each([true, false])('compares paired checkpoints (equal=%s)', (equal) => {
		const m = playing(),
			matchId = m.config.matchId;
		const cp = {
			type: 'CHECKPOINT' as const,
			matchId,
			checkpointId: 'turn-1',
			turnIndex: 1,
			logicalTick: 3000,
			hash: '12345678',
		};
		expect(coordinate(m, 'HOST', cp)).toEqual([]);
		expect(coordinate(m, 'GUEST', { ...cp, hash: equal ? cp.hash : '87654321' })[0].type).toBe(
			equal ? 'CHECKPOINT_OK' : 'RECOVERY_BEGIN'
		);
		expect(m.phase).toBe(equal ? 'playing' : 'recovering');
	});
	it('rejects world state, unknown commands, overflow, extra properties and wrong generation', () => {
		const m = playing(),
			matchId = m.config.matchId;
		for (const value of [
			{ type: 'START', seed: 1 },
			{ type: 'PROGRESS', matchId, logicalTick: -1 },
			{ type: 'PROGRESS', matchId, logicalTick: Infinity },
			{
				type: 'INPUT_PROPOSE',
				matchId,
				clientSequence: 1,
				clientTick: 0,
				turnIndex: 0,
				change: { commands: ['damage'] },
			},
			{
				type: 'CHECKPOINT',
				matchId,
				checkpointId: 'end',
				logicalTick: 1,
				turnIndex: 0,
				hash: '12345678',
				winner: 'RED',
			},
		])
			expect(parseClientMessage(JSON.stringify(value))).toBeNull();
		expect(() =>
			coordinate(m, 'HOST', { type: 'MATCH_READY', matchId: crypto.randomUUID() })
		).toThrow('INVALID_MATCH');
	});
});
