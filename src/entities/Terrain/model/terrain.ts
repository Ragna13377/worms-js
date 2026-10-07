/** World coordinates are centered, +Y up; each cell is one world unit. */
export type DirtyRegion = { left: number; bottom: number; right: number; top: number };
export type CircleContact = { normalX: number; normalY: number; penetration: number };

export function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export function generateSurface(width: number, height: number, seed: number): Float32Array {
	const random = seededRandom(seed);
	const surface = new Float32Array(width);
	for (const [spacing, amplitude] of [
		[width / 4, 0.25],
		[width / 9, 0.1],
		[width / 22, 0.025],
	]) {
		const knots = Array.from({ length: Math.ceil(width / spacing) + 2 }, () => random() * 2 - 1);
		for (let x = 0; x < width; x++) {
			const position = x / spacing;
			const index = Math.floor(position);
			const t = position - index;
			const smooth = t * t * (3 - 2 * t);
			surface[x] += (knots[index] * (1 - smooth) + knots[index + 1] * smooth) * height * amplitude;
		}
	}
	// Ocean margins occupy 10% at either end; smooth shores rise over 16%.
	for (let x = 0; x < width; x++) {
		const distance = Math.min(x, width - 1 - x) / width;
		const t = Math.max(0, Math.min(1, (distance - 0.1) / 0.16));
		surface[x] = (surface[x] + height * 0.53) * t * t * (3 - 2 * t);
	}
	return surface;
}

export class TerrainModel {
	readonly width: number;
	readonly height: number;
	readonly left: number;
	readonly bottom: number;
	/** Original height from bottom; stays intact after destruction. */
	readonly initialSurface: Float32Array;
	private readonly cells: Uint8Array;
	private readonly listeners = new Set<(region: DirtyRegion) => void>();

	constructor(
		width: number,
		height: number,
		readonly seed: number
	) {
		if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1)
			throw new RangeError('Terrain dimensions must be finite and positive');
		this.width = Math.ceil(width);
		this.height = Math.ceil(height);
		this.left = -this.width / 2;
		this.bottom = -this.height / 2;
		this.initialSurface = generateSurface(this.width, this.height, seed);
		this.cells = new Uint8Array(this.width * this.height);
		for (let x = 0; x < this.width; x++) {
			for (let y = 0; y < this.height && y + 0.5 <= this.initialSurface[x]; y++)
				this.cells[y * this.width + x] = 1;
		}
	}

	cellAt(x: number, y: number): boolean {
		return (
			x >= 0 && y >= 0 && x < this.width && y < this.height && this.cells[y * this.width + x] === 1
		);
	}

	/** Detached occupancy data for browser saves; renderer subscriptions stay local. */
	exportCells(): Uint8Array {
		return this.cells.slice();
	}

	restoreCells(cells: Uint8Array): void {
		if (cells.length !== this.cells.length || cells.some((cell) => cell !== 0 && cell !== 1))
			throw new RangeError('Invalid terrain snapshot');
		this.cells.set(cells);
		this.listeners.forEach((listener) => {
			listener({ left: 0, bottom: 0, right: this.width - 1, top: this.height - 1 });
		});
	}

	isSolid(x: number, y: number): boolean {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
		return this.cellAt(Math.floor(x - this.left), Math.floor(y - this.bottom));
	}

	heightAt(x: number): number | null {
		if (!Number.isFinite(x)) return null;
		const column = Math.floor(x - this.left);
		if (column < 0 || column >= this.width) return null;
		for (let y = this.height - 1; y >= 0; y--)
			if (this.cellAt(column, y)) return this.bottom + y + 1;
		return null;
	}

	subscribe(listener: (region: DirtyRegion) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	destroyCircle(x: number, y: number, radius: number): void {
		if (![x, y, radius].every(Number.isFinite) || radius <= 0) return;
		const cx = x - this.left;
		const cy = y - this.bottom;
		const region = {
			left: Math.max(0, Math.floor(cx - radius)),
			bottom: Math.max(0, Math.floor(cy - radius)),
			right: Math.min(this.width - 1, Math.floor(cx + radius)),
			top: Math.min(this.height - 1, Math.floor(cy + radius)),
		};
		let changed = false;
		for (let row = region.bottom; row <= region.top; row++) {
			for (let col = region.left; col <= region.right; col++) {
				if ((col + 0.5 - cx) ** 2 + (row + 0.5 - cy) ** 2 <= radius ** 2) {
					const index = row * this.width + col;
					if (this.cells[index]) {
						this.cells[index] = 0;
						changed = true;
					}
				}
			}
		}
		if (changed)
			this.listeners.forEach((listener) => {
				listener(region);
			});
	}

	/** Contact with the nearest raster boundary, including embedded centers.
	 * Normals reflect the occupancy grid, not the pre-destruction height curve. */
	collideCircle(x: number, y: number, radius: number): CircleContact | null {
		if (![x, y, radius].every(Number.isFinite) || radius <= 0) return null;
		const cx = x - this.left;
		const cy = y - this.bottom;
		if (!this.isSolid(x, y)) {
			let best = radius * radius;
			let dx = 0;
			let dy = 0;
			for (
				let row = Math.max(0, Math.floor(cy - radius));
				row <= Math.min(this.height - 1, Math.floor(cy + radius));
				row++
			) {
				for (
					let col = Math.max(0, Math.floor(cx - radius));
					col <= Math.min(this.width - 1, Math.floor(cx + radius));
					col++
				) {
					if (!this.cellAt(col, row)) continue;
					const vx = cx - Math.max(col, Math.min(col + 1, cx));
					const vy = cy - Math.max(row, Math.min(row + 1, cy));
					const distance = vx * vx + vy * vy;
					if (distance < best) {
						best = distance;
						dx = vx;
						dy = vy;
					}
				}
			}
			if (best === radius * radius) return null;
			const distance = Math.sqrt(best);
			return {
				normalX: distance ? dx / distance : 0,
				normalY: distance ? dy / distance : 1,
				penetration: radius - distance,
			};
		}
		const col = Math.floor(cx);
		const row = Math.floor(cy);
		let best = Infinity;
		let dx = 0;
		let dy = 1;
		const check = (px: number, py: number) => {
			if (this.cellAt(px, py)) return;
			// Distance to the empty cell box gives the exposed solid boundary.
			// Cell centers would add diagonal drift even on a flat surface.
			const vx = Math.max(px, Math.min(px + 1, cx)) - cx;
			const vy = Math.max(py, Math.min(py + 1, cy)) - cy;
			const distance = vx * vx + vy * vy;
			if (distance < best) {
				best = distance;
				dx = distance ? vx : px + 0.5 - cx;
				dy = distance ? vy : py + 0.5 - cy;
			}
		};
		for (
			let ring = 1;
			ring <= Math.max(this.width, this.height) && ring - 1 <= Math.sqrt(best);
			ring++
		) {
			for (let offset = -ring; offset <= ring; offset++) {
				check(col + offset, row + ring);
				check(col + offset, row - ring);
				check(col - ring, row + offset);
				check(col + ring, row + offset);
			}
		}
		const distance = Math.sqrt(best);
		const normalLength = Math.hypot(dx, dy);
		return {
			normalX: dx / normalLength,
			normalY: dy / normalLength,
			penetration: radius + distance,
		};
	}
}
