import type { GameWorld } from '../../entities/World/model/world';
import type { Game } from '../../widgets/Gameplay/model/simulation';

/** Exact numbers, stable keys, explicit simulation projection. No ownership or camera. */
function stable(value: unknown): string {
	if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
	if (value instanceof Map)
		return stable([...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
	if (value instanceof Set) return stable([...value].sort());
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	if (value && typeof value === 'object')
		return `{${Object.entries(value)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
			.join(',')}}`;
	return JSON.stringify(value) ?? 'null';
}
export function stateHash(game: Game, world: GameWorld, tick: number) {
	let hash = 2166136261;
	const add = (byte: number) => {
		hash = Math.imul(hash ^ byte, 16777619) >>> 0;
	};
	for (const cell of world.terrain.exportCells()) add(cell);
	const state = {
		tick,
		seed: world.seed,
		width: world.width,
		height: world.height,
		waterLevel: world.waterLevel,
		wind: world.wind,
		worms: [...game.worms].sort((a, b) => a.id.localeCompare(b.id)),
		match: game.match,
		time: game.time,
		accumulator: game.accumulator,
		pendingCommands: game.pendingCommands,
		inputNeedsNeutral: game.inputNeedsNeutral,
		weapon: game.weapon,
		teamWeapons: game.teamWeapons,
		projectiles: game.projectiles,
		lastShotResult: game.lastShotResult,
		nextProjectileId: game.nextProjectileId,
		explosions: game.explosions,
		healthFeedback: game.healthFeedback,
	};
	for (const byte of new TextEncoder().encode(stable(state))) add(byte);
	return hash.toString(16).padStart(8, '0');
}
