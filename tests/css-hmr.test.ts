import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const transform = require('../scripts/css-hmr-safe-remove.cjs') as (source: string) => string;
const source = readFileSync(
	require.resolve('next/dist/compiled/mini-css-extract-plugin/hmr/hotModuleReplacement.js'),
	'utf8'
);

afterEach(() => vi.useRealTimers());
describe('Next CSS hot reload cleanup', () => {
	it.each(['load', 'error'])(
		'handles an old stylesheet already detached before the %s event',
		(event) => {
			vi.useFakeTimers();
			const listeners = new Map<string, () => void>();
			const replacement = {
				isLoaded: false,
				addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
			};
			const original = {
				href: 'http://localhost/menu.css',
				parentNode: { appendChild: vi.fn(), removeChild: vi.fn() } as object | null,
				cloneNode: () => replacement,
				remove() {
					this.parentNode = null;
				},
			};
			const module = { exports: undefined as unknown };
			runInNewContext(transform(source), {
				module,
				__dirname: '.',
				console: { log: vi.fn() },
				setTimeout,
				clearTimeout,
				document: {
					currentScript: { src: 'http://localhost/menu.js' },
					querySelectorAll: () => [original],
				},
			});
			const refresh = module.exports as (id: number, options: { locals: boolean }) => () => void;
			refresh(1, { locals: true })();
			vi.advanceTimersByTime(60);
			original.parentNode = null;
			expect(listeners.has(event)).toBe(true);
			expect(() => listeners.get(event)?.()).not.toThrow();
			expect(replacement.isLoaded).toBe(true);
		}
	);
});
