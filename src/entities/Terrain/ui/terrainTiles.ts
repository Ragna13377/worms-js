import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace } from 'three';
import type { DirtyRegion, TerrainModel } from '../model/terrain';

const TILE_SIZE = 128;
const RIM_WIDTH = 8;
const rimOffsets = Array.from({ length: (RIM_WIDTH * 2 + 1) ** 2 }, (_, i) => ({
	x: (i % (RIM_WIDTH * 2 + 1)) - RIM_WIDTH,
	y: Math.floor(i / (RIM_WIDTH * 2 + 1)) - RIM_WIDTH,
}))
	.map((p) => ({ ...p, d: Math.hypot(p.x, p.y) }))
	.filter((p) => p.d <= RIM_WIDTH)
	.sort((a, b) => a.d - b.d);
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
	index: number,
	scar = false
) {
	const tx = x % 64;
	const ty = y % 64;
	const grain = ((tx * 37 + ty * 53 + tx * ty * 7) % 23) - 11;
	// Explicit rock silhouettes keep their proportions across the entire tile.
	const stone =
		((tx - 12) / 7) ** 2 + ((ty - 14) / 5) ** 2 < 1 ||
		((tx - 43) / 9) ** 2 + ((ty - 37) / 7) ** 2 < 1 ||
		((tx - 19) / 6) ** 2 + ((ty - 52) / 4) ** 2 < 1;
	const depth = terrain.initialSurface[x] - (y + 0.5);
	let r = (stone ? 124 : 99) + grain;
	let g = (stone ? 86 : 61) + grain;
	let b = (stone ? 53 : 36) + grain;
	// Restored/custom masks may cover the original skyline. Never draw buried grass.
	const skylineExposed = !terrain.cellAt(x, Math.floor(terrain.initialSurface[x] + 0.5));
	if (depth >= 0 && depth < 12 && skylineExposed) {
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
	if (scar && terrain.cellAt(x, y)) {
		const edge = rimOffsets.find((p) => {
			const cx = x + p.x,
				cy = y + p.y;
			return (
				cx >= 0 &&
				cx < terrain.width &&
				cy >= 0 &&
				cy < terrain.height &&
				cy + 0.5 <= terrain.initialSurface[cx] &&
				!terrain.cellAt(cx, cy)
			);
		});
		if (edge) {
			const blend = (1 - edge.d / (RIM_WIDTH + 1)) ** 0.6;
			r = Math.round(r + (148 - r) * blend);
			g = Math.round(g + (151 - g) * blend);
			b = Math.round(b + (224 - b) * blend);
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
	const update = (dirty: DirtyRegion) => {
		const region = {
			left: Math.max(0, dirty.left - RIM_WIDTH),
			right: Math.min(terrain.width - 1, dirty.right + RIM_WIDTH),
			bottom: Math.max(0, dirty.bottom - RIM_WIDTH),
			top: Math.min(terrain.height - 1, dirty.top + RIM_WIDTH),
		};
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
						paintPixel(
							terrain,
							x,
							y,
							tile.pixels,
							((y - tile.y) * tile.width + x - tile.x) * 4,
							true
						);
					}
				}
				tile.texture.needsUpdate = true;
			}
		}
	};
	return {
		tiles,
		update,
		dispose: () =>
			tiles.forEach((tile) => {
				tile.texture.dispose();
			}),
	};
}
