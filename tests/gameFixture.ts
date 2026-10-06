import type { MatchConfig } from '../src/entities/Match/model/match';
import { MATCH } from '../src/entities/Match/model/match';
import type { GameWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { advanceGame, createGame } from '../src/widgets/Gameplay/model/simulation';
/** Stage 1–3 mechanics are exercised during the real match's CONTROL phase. */
export function createControlledGame(world: GameWorld, counts?: MatchConfig) {
	const game = createGame(world, counts);
	for (let i = 0; i < Math.round(MATCH.introSeconds / WORM.fixedStep); i++)
		advanceGame(game, world, { moveDirection: 0, commands: [] }, WORM.fixedStep);
	return game;
}
