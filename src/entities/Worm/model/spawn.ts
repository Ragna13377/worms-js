import { seededRandom } from '../../Terrain/model/terrain';
import type { GameWorld } from '../../World/model/world';
import { SPAWN, WORM } from './config';
import { wormNames } from './names';
import { restingY, supportAt } from './support';
import { createWorm, type Team, type Worm } from './worm';

export type TeamCounts = Record<Team, number>;

export function spawnWorms(world: GameWorld, counts: TeamCounts = { RED: 3, BLUE: 3 }) {
	for (const count of Object.values(counts))
		if (!Number.isInteger(count) || count < 1 || count > 3)
			throw new RangeError('Each team must request 1–3 worms');
	const worms: Worm[] = [];
	const names = wormNames(world.seed);
	const random = seededRandom(world.seed ^ 0x5702);
	const margin = SPAWN.edgeMargin + WORM.radius;
	const span = Math.max(0, world.width - margin * 2);
	const trySpawn = (team: Team, x: number) => {
		if (
			!span ||
			worms.some(
				(worm) =>
					Math.abs(worm.position.x - x) <
					(worm.team === team ? SPAWN.teammateDistance : SPAWN.opponentDistance)
			)
		)
			return;
		const height = world.terrain.heightAt(x);
		if (height === null || height <= world.waterLevel + SPAWN.waterMargin) return;
		const y = restingY(world.terrain, x, height + WORM.radius + 4, height, WORM.radius);
		if (y === null || y - WORM.radius <= world.waterLevel + SPAWN.waterMargin) return;
		const support = supportAt(world.terrain, x, y, WORM.radius);
		if (!support || Math.abs(support.slope) > SPAWN.maxSlope) return;
		for (const offset of [-WORM.radius, 0, WORM.radius]) {
			const side = world.terrain.heightAt(x + offset);
			if (side === null || Math.abs(side - height) > WORM.radius * 0.8) return;
		}
		const number = worms.filter((worm) => worm.team === team).length + 1;
		const worm = createWorm(`${team}-${number}`, team, x, y);
		worm.name = names[worms.length];
		worms.push(worm);
	};
	for (const team of ['RED', 'BLUE'] as const) {
		const teamCount = () => worms.filter((worm) => worm.team === team).length;
		for (
			let attempt = 0;
			attempt < SPAWN.attemptsPerTeam && teamCount() < counts[team];
			attempt++
		) {
			// Prefer opposing halves; fallback can use the entire island but preserves spacing.
			const fraction = (team === 'RED' ? 0 : 0.5) + random() * 0.5;
			trySpawn(team, world.terrain.left + margin + fraction * span);
		}
		for (let index = 0; index < SPAWN.fallbackCandidates && teamCount() < counts[team]; index++)
			trySpawn(
				team,
				world.terrain.left + margin + ((index + 0.5) / SPAWN.fallbackCandidates) * span
			);
	}
	return { worms, missing: counts.RED + counts.BLUE - worms.length };
}
