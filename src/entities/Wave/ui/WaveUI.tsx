import { Plane } from '@react-three/drei';
import { defaultWaveQuality } from '../constants';
import { WaveUIProps } from '../types';
import waveVertexShader from './shaders/wave.vert';
import waveFragmentShader from './shaders/wave.frag';

const WaveUI = ({ uniforms, width, thickness, position }: WaveUIProps) => (
	<Plane args={[width, thickness, defaultWaveQuality, defaultWaveQuality]} position={position}>
		<shaderMaterial
			vertexShader={waveVertexShader}
			fragmentShader={waveFragmentShader}
			uniforms={uniforms}
		/>
	</Plane>
);

export default WaveUI;
