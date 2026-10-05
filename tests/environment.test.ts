import assert from 'node:assert/strict';
import { applyProps } from '@react-three/fiber';
import { ShaderMaterial } from 'three';
import { test } from 'vitest';
import { TerrainModel } from '../src/entities/Terrain/model/terrain';
import { advanceWaveTime, waveSegments } from '../src/entities/Wave/model/animation';
import { advanceWindParticles } from '../src/entities/World/model/particles';

test('wave time reaches the actual material after R3F merges uniform props', () => {
	const uniforms = { uTime: { value: 0 } };
	const material = new ShaderMaterial();
	applyProps(material, { uniforms });
	advanceWaveTime(material, 0.02);
	advanceWaveTime(material, 0.03);
	assert.equal(material.uniforms.uTime.value, 0.05);
	advanceWaveTime(null, 0.02);
	material.dispose();
});

test('4K-wide worlds retain at most three world units between wave vertices', () => {
	for (const width of [800 * 2.25, 1920 * 2.25, 3840 * 2.25])
		assert.ok(width / waveSegments(width) <= 3);
});

test('island ends leave open water well before both world bounds', () => {
	for (const seed of [0, 1, 42, 13377, 0xffffffff]) {
		const terrain = new TerrainModel(1800, 600, seed);
		for (const col of [0, 90, 1799, 1709]) {
			assert.equal(terrain.heightAt(terrain.left + col + 0.5), null);
		}
		assert.ok(terrain.initialSurface[270] < terrain.height * 0.25);
		assert.ok(terrain.initialSurface[1529] < terrain.height * 0.25);
		assert.ok(terrain.heightAt(0) !== null);
	}
});

test('debris falls vertically in calm weather and diagonally with signed wind', () => {
	for (const wind of [-1, 0, 1]) {
		const positions = new Float32Array([0, 10, 2]);
		advanceWindParticles(positions, new Float32Array([1]), wind, 100, 50, -50, 0.04);
		assert.ok(positions[1] < 10);
		assert.equal(Math.sign(positions[0]), Math.sign(wind));
		assert.equal(positions[2], 2);
	}
	const recycled = new Float32Array([49, -49, 2]);
	advanceWindParticles(recycled, new Float32Array([1]), 1, 100, 50, -50, 0.05);
	assert.ok(recycled[0] < 0);
	assert.equal(recycled[1], 50);
});
