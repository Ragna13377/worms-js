import { applyProps } from '@react-three/fiber';
import { Mesh, MeshBasicMaterial, ShaderMaterial } from 'three';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BUBBLE_CONFIG } from '../src/entities/Bubble/constants';
import { useBubbleAnimation } from '../src/entities/Bubble/model/hooks/useBubbleAnimation';
import { DEFAULT_WAVE_SHADER_CONFIG } from '../src/entities/Wave/constants';
import { Wave } from '../src/entities/Wave/model/Wave';

// Preserve hook slots while driving the real animation callbacks and R3F prop merge.
const hooks = vi.hoisted(() => ({
	slots: [] as { current?: unknown; deps?: unknown[]; value?: unknown }[],
	index: 0,
	frame: (_state: { clock?: { elapsedTime: number } }, _delta: number) => {},
}));
vi.mock('react', async (original) => ({
	...(await original<typeof import('react')>()),
	useRef: (value: unknown) => (hooks.slots[hooks.index++] ??= { current: value }),
	useMemo: (factory: () => unknown, deps: unknown[]) => {
		const i = hooks.index++,
			previous = hooks.slots[i];
		if (!previous || deps.some((v, j) => !Object.is(v, previous.deps?.[j])))
			hooks.slots[i] = { deps, value: factory() };
		return hooks.slots[i].value;
	},
}));
vi.mock('@react-three/fiber', async (original) => ({
	...(await original<typeof import('@react-three/fiber')>()),
	useFrame: (callback: typeof hooks.frame) => {
		hooks.frame = callback;
	},
}));
vi.mock('../src/entities/Wave/ui/WaveUI', () => ({ default: () => null }));
beforeEach(() => {
	hooks.slots = [];
	hooks.index = 0;
});

it('network parent rerenders preserve wave phase with equivalent fresh shader props', () => {
	const render = () => {
		hooks.index = 0;
		return Wave({
			index: 0,
			baseYPos: 0,
			width: 1280,
			thickness: 10,
			overlapFactor: 0.4,
			phaseOffset: 0,
			shaderConfig: { ...DEFAULT_WAVE_SHADER_CONFIG },
		});
	};
	const first = render();
	const material = new ShaderMaterial();
	first.props.materialRef.current = material;
	applyProps(material, { uniforms: first.props.uniforms });
	for (let i = 0; i < 30; i++) hooks.frame({}, 1 / 60);
	const elapsed = material.uniforms.uTime.value;
	const next = render();
	applyProps(material, { uniforms: next.props.uniforms });
	expect(material.uniforms.uTime.value).toBe(elapsed);
	hooks.frame({}, 1 / 60);
	expect(material.uniforms.uTime.value).toBeGreaterThan(elapsed);
});

it('bubbles continue rising across network rerenders and a wind change', () => {
	const render = (wind = 0) => {
		hooks.index = 0;
		return useBubbleAnimation({
			type: 'medium',
			xRange: { range: [-500, 500], step: 100 },
			yRange: { range: [-200, 0] },
			fadeRange: { range: [-30, 0] },
			config: DEFAULT_BUBBLE_CONFIG,
			wind,
		});
	};
	const first = render();
	const mesh = new Mesh(undefined, new MeshBasicMaterial());
	first.bubbleRef.current = mesh;
	for (let i = 0; i < 60; i++) hooks.frame({ clock: { elapsedTime: i / 60 } }, 1 / 60);
	const y = mesh.position.y;
	render(1);
	hooks.frame({ clock: { elapsedTime: 1 } }, 1 / 60);
	expect(mesh.position.y).toBeGreaterThan(y);
});
