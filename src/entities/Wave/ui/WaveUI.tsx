import { Plane } from '@react-three/drei';
import { waveSegments } from '../model/animation';
import type { WaveUIProps } from '../types';
import waveFragmentShader from './shaders/wave.frag';
import waveVertexShader from './shaders/wave.vert';

const WaveUI = ({ uniforms, size, position, materialRef }: WaveUIProps) => (
	<Plane args={[...size, waveSegments(size[0]), 1]} position={position}>
		<shaderMaterial
			ref={materialRef}
			vertexShader={waveVertexShader}
			fragmentShader={waveFragmentShader}
			uniforms={uniforms}
		/>
	</Plane>
);

WaveUI.displayName = 'WaveUI';
export default WaveUI;
