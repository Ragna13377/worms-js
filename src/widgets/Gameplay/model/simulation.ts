import type { GameWorld } from '../../../entities/World/model/world';
import { WORM } from '../../../entities/Worm/model/config';
import { NO_INPUT, stepWorm, type WormInput } from '../../../entities/Worm/model/physics';
import { spawnWorms, type TeamCounts } from '../../../entities/Worm/model/spawn';

export type Command = 'forwardJump' | 'highJump' | 'cycle' | 'moveLeft' | 'moveRight';
export type GameInput = { moveDirection: -1 | 0 | 1; commands: Command[] };

export function createGame(world: GameWorld, counts?: TeamCounts) {
	const spawn = spawnWorms(world, counts);
	return {
		...spawn,
		debugActiveWormId: spawn.worms[0]?.id ?? null,
		time: 0,
		accumulator: 0,
		pendingCommands: [] as Command[],
	};
}
export type Game = ReturnType<typeof createGame>;

export function activeWorm(game: Game) {
	return game.worms.find((worm) => worm.id === game.debugActiveWormId && worm.alive) ?? null;
}

export function cycleWorm(game: Game) {
	const living = game.worms.filter((worm) => worm.alive);
	const index = living.findIndex((worm) => worm.id === game.debugActiveWormId);
	game.debugActiveWormId = living[(index + 1) % living.length]?.id ?? null;
}

/** Queued edge inputs survive frames with no physics step, and are consumed exactly once. */
export function advanceGame(game: Game, world: GameWorld, input: GameInput, elapsed: number) {
	game.pendingCommands.push(...input.commands);
	game.accumulator = Math.min(
		WORM.maxAccumulatedTime,
		game.accumulator + Math.max(0, Number.isFinite(elapsed) ? elapsed : 0)
	);
	let steps = 0;
	while (game.accumulator + 1e-10 >= WORM.fixedStep) {
		if (!activeWorm(game)) cycleWorm(game);
		const intentions: WormInput = { ...NO_INPUT, moveDirection: input.moveDirection };
		for (const command of game.pendingCommands) {
			if (command === 'cycle') {
				cycleWorm(game);
				intentions.forwardJumpPressed = intentions.highJumpPressed = false;
				intentions.backflipPressed = false;
			} else if (command === 'forwardJump') intentions.forwardJumpPressed = true;
			else if (command === 'highJump') {
				intentions.backflipPressed = intentions.highJumpPressed;
				intentions.highJumpPressed = true;
			} else if (!input.moveDirection) intentions.moveDirection = command === 'moveLeft' ? -1 : 1;
		}
		game.pendingCommands.length = 0;
		for (const worm of game.worms)
			stepWorm(
				worm,
				world,
				worm.id === game.debugActiveWormId ? intentions : NO_INPUT,
				WORM.fixedStep,
				game.time
			);
		if (!activeWorm(game)) cycleWorm(game);
		game.time += WORM.fixedStep;
		game.accumulator = Math.max(0, game.accumulator - WORM.fixedStep);
		steps++;
	}
	return steps;
}

export function followCamera(current: number, target: number, elapsed: number) {
	return current + (target - current) * (1 - Math.exp(-WORM.cameraResponse * Math.max(0, elapsed)));
}
