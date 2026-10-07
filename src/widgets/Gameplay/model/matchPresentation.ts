import type { Team } from '../../../entities/Worm/model/worm';
import type { Game } from './simulation';

export const MATCH_OUTRO = { emptyHold: 0.65, slide: 0.75, celebration: 1.8, fade: 0.8 } as const;
export function teamDisplayedHp(game: Game, team: Team) {
	return game.worms
		.filter((w) => w.team === team)
		.reduce((hp, w) => hp + (game.healthFeedback.get(w.id)?.displayed ?? w.hp), 0);
}
/** Keep tied teams in their previous order to avoid flickering during damage feedback. */
export function rankedTeams(game: Game, previous: Team[]): Team[] {
	return [...previous].sort((a, b) => teamDisplayedHp(game, b) - teamDisplayedHp(game, a));
}
export function matchOutro(game: Game) {
	const age =
		game.match.turnState === 'MATCH_END'
			? Math.max(0, game.time - (game.match.endedAt ?? game.time))
			: -1;
	const announcementAt = MATCH_OUTRO.emptyHold + MATCH_OUTRO.slide;
	const fadeAt = announcementAt + MATCH_OUTRO.celebration;
	return {
		age,
		slide: age >= MATCH_OUTRO.emptyHold,
		announce: age >= announcementAt,
		fade: Math.max(0, Math.min(1, (age - fadeAt) / MATCH_OUTRO.fade)),
		done: age >= fadeAt + MATCH_OUTRO.fade,
	};
}
