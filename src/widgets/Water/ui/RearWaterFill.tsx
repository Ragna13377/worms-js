import { advanceWaveTime, waveSegments } from '@entities/Wave/model/animation';
import type { WaveProps } from '@entities/Wave/types';
import waveVertexShader from '@entities/Wave/ui/shaders/wave.vert';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type Color, type Mesh, OrthographicCamera, type ShaderMaterial } from 'three';
import { waterCoverage } from '../model/coverage';

// The fill's top edge follows the underside of the highest rear ribbon. Its bottom stays flat.
const vertexShader =
	'uniform float uFillHeight;\n' +
	waveVertexShader.replace('position.y + wave', 'position.y * uFillHeight + wave * uv.y');
const fragmentShader = `uniform vec3 uColor; void main(){gl_FragColor=vec4(uColor,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export function RearWaterFill({
	wave,
	bottom,
	color,
}: {
	wave: Omit<WaveProps, 'index'>;
	bottom: number;
	color: Color;
}) {
	const mesh = useRef<Mesh>(null),
		material = useRef<ShaderMaterial>(null);
	const top =
		wave.baseYPos -
		(wave.shaderConfig.uAmplitude * 2 + wave.thickness * wave.overlapFactor) * (wave.row ?? 0) -
		wave.thickness / 2;
	const uniforms = useMemo(
		() => ({
			uTime: { value: 0 },
			uFillHeight: { value: 1 },
			uAmplitude: { value: wave.shaderConfig.uAmplitude },
			uFrequency: { value: wave.shaderConfig.uFrequency },
			uPhaseOffset: { value: wave.phaseOffset },
			uSpeedVariation: { value: 0 },
			uColor: { value: color },
		}),
		[wave, color]
	);
	useFrame(({ camera, size }, delta) => {
		if (!mesh.current || !material.current) return;
		advanceWaveTime(material.current, delta);
		const coverage = waterCoverage(
			top,
			bottom,
			camera.position.y,
			size.height / (camera instanceof OrthographicCamera ? camera.zoom : 1)
		);
		mesh.current.position.y = coverage.y;
		material.current.uniforms.uFillHeight.value = coverage.height;
	});
	return (
		<mesh ref={mesh} position={[0, top, 2.4]}>
			<planeGeometry args={[wave.width, 1, waveSegments(wave.width), 1]} />
			<shaderMaterial
				ref={material}
				uniforms={uniforms}
				vertexShader={vertexShader}
				fragmentShader={fragmentShader}
			/>
		</mesh>
	);
}
