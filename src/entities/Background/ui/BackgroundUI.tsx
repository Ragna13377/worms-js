import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import type { BackgroundUIProps } from '../types';
import bgFragmentShader from './shaders/background.frag';
import bgVertexShader from './shaders/background.vert';

const BackgroundUI = ({ size, uniform }: BackgroundUIProps) => {
	const mesh = useRef<Mesh>(null);
	const skyUniforms = useMemo(
		() => ({ ...uniform, uGradientHeight: { value: size[1] } }),
		[uniform, size]
	);
	useFrame(({ camera, viewport }) => {
		if (!mesh.current) return;
		mesh.current.position.set(camera.position.x, camera.position.y, -2);
		mesh.current.scale.set(viewport.width + 2, viewport.height + 2, 1);
	});
	return (
		<mesh ref={mesh} frustumCulled={false}>
			<planeGeometry args={[1, 1]} />
			<shaderMaterial
				vertexShader={bgVertexShader}
				fragmentShader={bgFragmentShader}
				uniforms={skyUniforms}
				depthWrite={false}
			/>
		</mesh>
	);
};
export default BackgroundUI;
