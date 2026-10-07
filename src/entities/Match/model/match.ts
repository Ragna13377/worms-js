import type { TeamCounts } from '../../Worm/model/spawn';
import type { Team, Worm } from '../../Worm/model/worm';

export type MatchConfig = TeamCounts & { teamNames?: Partial<Record<Team, string>> };
export type TurnState = 'TURN_START' | 'CONTROL' | 'FIRING' | 'SETTLING' | 'TURN_END' | 'MATCH_END';
export type MatchResult = Team | 'DRAW' | null;
export const MATCH = {
	turnSeconds: 45,
	gameSeconds: 600,
	introSeconds: 3,
	stabilitySeconds: 0.35,
	velocityEpsilon: 0.01,
	observationSeconds: 2.5,
} as const;
export function turnOrder(worms: Worm[]) {
	const ordinal = (worm: Worm) => Number(worm.id.slice(worm.id.lastIndexOf('-') + 1));
	const teams = (['RED', 'BLUE'] as const).map((team) =>
		worms.filter((w) => w.team === team).sort((a, b) => ordinal(a) - ordinal(b))
	);
	return Array.from({ length: Math.max(...teams.map((t) => t.length)) }, (_, i) =>
		teams.flatMap((team) => (team[i] ? [team[i].id] : []))
	).flat();
}
export function createMatch(worms: Worm[], config: MatchConfig = { RED: 3, BLUE: 3 }) {
	for (const team of ['RED', 'BLUE'] as const)
		if (!Number.isInteger(config[team]) || config[team] < 1 || config[team] > 3)
			throw new RangeError('Each team must request 1–3 worms');
	const order = turnOrder(worms);
	return {
		config: {
			RED: config.RED,
			BLUE: config.BLUE,
			teamNames: {
				RED: config.teamNames?.RED?.trim() || 'RED',
				BLUE: config.teamNames?.BLUE?.trim() || 'BLUE',
			},
		},
		initialRoster: {
			RED: worms.filter((w) => w.team === 'RED').map((w) => w.id),
			BLUE: worms.filter((w) => w.team === 'BLUE').map((w) => w.id),
		},
		turnOrder: order,
		turnCursor: 0,
		turnIndex: 0,
		activeWormId: (order[0] ?? null) as string | null,
		turnState: 'TURN_START' as TurnState,
		turnTimeRemaining: MATCH.turnSeconds as number,
		matchTimeRemaining: MATCH.gameSeconds as number,
		phaseTime: 0,
		settleStableTime: 0,
		result: null as MatchResult,
	};
}
export type MatchState = ReturnType<typeof createMatch>;
export function canControl(match: MatchState) {
	return match.turnState === 'CONTROL' && match.activeWormId !== null;
}
export function livingTeamWorms(worms: Worm[], team: Team) {
	return worms.filter((w) => w.team === team && w.alive);
}
export function teamCurrentHp(worms: Worm[], team: Team) {
	return worms.filter((w) => w.team === team && w.alive).reduce((hp, w) => hp + w.hp, 0);
}
export function teamMaxHp(match: MatchState, team: Team) {
	return match.initialRoster[team].length * 100;
}
export function matchResult(worms: Worm[]): MatchResult {
	const red = livingTeamWorms(worms, 'RED').length,
		blue = livingTeamWorms(worms, 'BLUE').length;
	return red && blue ? null : red ? 'RED' : blue ? 'BLUE' : 'DRAW';
}
export function timeoutResult(worms: Worm[]): Exclude<MatchResult, null> {
	const red = teamCurrentHp(worms, 'RED'),
		blue = teamCurrentHp(worms, 'BLUE');
	return red === blue ? 'DRAW' : red > blue ? 'RED' : 'BLUE';
}
export function nextLivingCursor(match: MatchState, worms: Worm[], start = match.turnCursor + 1) {
	for (let offset = 0; offset < match.turnOrder.length; offset++) {
		const index = (start + offset) % match.turnOrder.length;
		if (worms.some((w) => w.id === match.turnOrder[index] && w.alive)) return index;
	}
	return null;
}
