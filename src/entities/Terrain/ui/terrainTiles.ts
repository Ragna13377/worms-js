import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace } from 'three';
import { DirtyRegion, TerrainModel } from '../model/terrain';

const TILE_SIZE = 128;
export type TerrainTile = {
	x: number;
	y: number;
	width: number;
	height: number;
	pixels: Uint8Array;
	texture: DataTexture;
};

/** Small repeating local dirt/stone pattern; replace this function with art later. */
function paintPixel(
	terrain: TerrainModel,
	x: number,
	y: number,
	pixels: Uint8Array,
	index: number
) {
	const tx = x % 64;
	const ty = y % 64;
	const grain = ((tx * 37 + ty * 53 + tx * ty * 7) % 23) - 11;
	const stone = Math.sin(tx * 0.18 + Math.sin(ty * 0.2)) * Math.cos(ty * 0.24) > 0.45;
	const depth = terrain.initialSurface[x] - (y + 0.5);
	let r = (stone ? 124 : 99) + grain;
	let g = (stone ? 86 : 61) + grain;
	let b = (stone ? 53 : 36) + grain;
	if (depth >= 0 && depth < 12) {
		const fringe = 4 + 2 * Math.sin(x * 0.8) + Math.sin(x * 0.27);
		if (depth < fringe) {
			r = 90 + grain;
			g = 130 + grain;
			b = 39 + grain;
		} else {
			r = 77 + grain;
			g = 61 + grain;
			b = 30 + grain;
		}
	}
	pixels[index] = r;
	pixels[index + 1] = g;
	pixels[index + 2] = b;
	pixels[index + 3] = terrain.cellAt(x, y) ? 255 : 0;
}

export function createTerrainTiles(terrain: TerrainModel) {
	const tiles: TerrainTile[] = [];
	for (let y = 0; y < terrain.height; y += TILE_SIZE) {
		for (let x = 0; x < terrain.width; x += TILE_SIZE) {
			const width = Math.min(TILE_SIZE, terrain.width - x);
			const height = Math.min(TILE_SIZE, terrain.height - y);
			const pixels = new Uint8Array(width * height * 4);
			for (let row = 0; row < height; row++) {
				for (let col = 0; col < width; col++)
					paintPixel(terrain, x + col, y + row, pixels, (row * width + col) * 4);
			}
			const texture = new DataTexture(pixels, width, height, RGBAFormat);
			texture.magFilter = texture.minFilter = NearestFilter;
			texture.colorSpace = SRGBColorSpace;
			texture.needsUpdate = true;
			tiles.push({ x, y, width, height, pixels, texture });
		}
	}
	const update = (region: DirtyRegion) => {
		const columns = Math.ceil(terrain.width / TILE_SIZE);
		for (
			let ty = Math.floor(region.bottom / TILE_SIZE);
			ty <= Math.floor(region.top / TILE_SIZE);
			ty++
		) {
			for (
				let tx = Math.floor(region.left / TILE_SIZE);
				tx <= Math.floor(region.right / TILE_SIZE);
				tx++
			) {
				const tile = tiles[ty * columns + tx];
				for (
					let y = Math.max(tile.y, region.bottom);
					y <= Math.min(tile.y + tile.height - 1, region.top);
					y++
				) {
					for (
						let x = Math.max(tile.x, region.left);
						x <= Math.min(tile.x + tile.width - 1, region.right);
						x++
					) {
						tile.pixels[((y - tile.y) * tile.width + x - tile.x) * 4 + 3] = terrain.cellAt(x, y)
							? 255
							: 0;
					}
				}
				tile.texture.needsUpdate = true;
			}
		}
	};
	return { tiles, update, dispose: () => tiles.forEach((tile) => tile.texture.dispose()) };
}
