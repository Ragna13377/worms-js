import { TerrainModel } from '../../../entities/Terrain/model/terrain';
import type { GameWorld } from '../../../entities/World/model/world';
import type { Game } from './simulation';

export type GameMode = 'pvp' | 'bot' | 'lobby';
export type SavedGame = {
	version: 1;
	savedAt: number;
	mode: Exclude<GameMode, 'lobby'>;
	world: Omit<GameWorld, 'terrain'>;
	terrain: Uint8Array;
	game: Game;
};
export function createSnapshot(game: Game, world: GameWorld, mode: GameMode): SavedGame {
	if (mode === 'lobby') throw new Error('Lobby matches cannot be saved');
	const { terrain, ...settings } = world;
	return {
		version: 1,
		savedAt: Date.now(),
		mode,
		world: { ...settings },
		terrain: terrain.exportCells(),
		game: structuredClone(game),
	};
}
export function restoreSnapshot(snapshot: SavedGame): {
	game: Game;
	world: GameWorld;
	mode: SavedGame['mode'];
} {
	if (snapshot?.version !== 1 || !['pvp', 'bot'].includes(snapshot.mode))
		throw new Error('Unsupported save');
	const { width, height, seed, wind, waterLevel } = snapshot.world;
	if (
		![width, height, seed, wind, waterLevel].every(Number.isFinite) ||
		width < 1 ||
		height < 1 ||
		width * height > 64_000_000 ||
		!Number.isInteger(width) ||
		!Number.isInteger(height)
	)
		throw new Error('Invalid saved world');
	if (!(snapshot.terrain instanceof Uint8Array) || snapshot.terrain.length !== width * height)
		throw new Error('Invalid saved terrain');
	const game = structuredClone(snapshot.game);
	if (
		!game?.match ||
		!Array.isArray(game.worms) ||
		game.worms.length < 2 ||
		!(game.healthFeedback instanceof Map) ||
		!Array.isArray(game.projectiles) ||
		!game.explosions ||
		!Number.isFinite(game.time)
	)
		throw new Error('Invalid saved match');
	for (const team of ['RED', 'BLUE'] as const)
		if (![1, 2, 3].includes(game.match.config[team])) throw new Error('Invalid saved roster');
	const terrain = new TerrainModel(width, height, seed);
	terrain.restoreCells(snapshot.terrain);
	game.paused = false;
	return { game, world: { ...snapshot.world, terrain }, mode: snapshot.mode };
}
function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('worms-js', 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore('saves');
		};
		request.onsuccess = () => {
			resolve(request.result);
		};
		request.onerror = () => {
			reject(request.error);
		};
		request.onblocked = () => {
			reject(new Error('Storage blocked'));
		};
	});
}
function accessSlot(operation: 'read'): Promise<SavedGame | undefined>;
function accessSlot(operation: 'exists'): Promise<boolean>;
function accessSlot(operation: 'write' | 'delete', snapshot?: SavedGame): Promise<undefined>;
async function accessSlot(
	operation: 'read' | 'write' | 'exists' | 'delete',
	snapshot?: SavedGame
): Promise<SavedGame | boolean | undefined> {
	const db = await openDatabase();
	try {
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(
				'saves',
				['read', 'exists'].includes(operation) ? 'readonly' : 'readwrite'
			);
			const store = tx.objectStore('saves');
			const request =
				operation === 'read'
					? store.get('current')
					: operation === 'exists'
						? store.count('current')
						: operation === 'delete'
							? store.delete('current')
							: store.put(snapshot, 'current');
			tx.oncomplete = () => {
				resolve(
					operation === 'read'
						? request.result
						: operation === 'exists'
							? request.result > 0
							: undefined
				);
			};
			tx.onerror = () => {
				reject(tx.error);
			};
			tx.onabort = () => {
				reject(tx.error ?? new Error('Storage transaction aborted'));
			};
		});
	} finally {
		db.close();
	}
}
export async function saveGame(game: Game, world: GameWorld, mode: GameMode) {
	await accessSlot('write', createSnapshot(game, world, mode));
}
export function loadGame() {
	return accessSlot('read');
}
export function hasSavedGame() {
	return accessSlot('exists');
}
export function deleteSavedGame() {
	return accessSlot('delete');
}
