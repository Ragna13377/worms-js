import { Plane } from '@react-three/drei';
import { WaveUIProps } from '../types';
import waveVertexShader from './shaders/wave.vert';
import waveFragmentShader from './shaders/wave.frag';

const WaveUI = ({ uniforms, thickness, position }: WaveUIProps) => (
	<Plane args={[window.innerWidth, thickness, 128, 128]} position={position}>
		<shaderMaterial
			vertexShader={waveVertexShader}
			fragmentShader={waveFragmentShader}
			uniforms={uniforms}
		/>
	</Plane>
);

export default WaveUI;
