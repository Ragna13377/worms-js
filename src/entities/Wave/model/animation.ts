import type { ShaderMaterial } from 'three';

/** R3F merges uniform props; animate the material's own uniform objects. */
export function advanceWaveTime(material: ShaderMaterial | null, delta: number): void {
	if (material) material.uniforms.uTime.value += Math.min(delta, 0.05);
}

/** Keep the crest smooth at any world width, with no unnecessary vertical grid. */
export function waveSegments(width: number): number {
	return Math.max(1, Math.ceil(width / 3));
}
