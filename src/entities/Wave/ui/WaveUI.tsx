import { Plane } from '@react-three/drei';
import { defaultWaveQuality } from '../constants';
import { WaveUIProps } from '../types';
import waveVertexShader from './shaders/wave.vert';
import waveFragmentShader from './shaders/wave.frag';

const WaveUI = ({ uniforms, size, position }: WaveUIProps) => (
	<Plane args={[...size, defaultWaveQuality, defaultWaveQuality]} position={position}>
		<shaderMaterial
			vertexShader={waveVertexShader}
			fragmentShader={waveFragmentShader}
			uniforms={uniforms}
		/>
	</Plane>
);

WaveUI.displayName = 'WaveUI';
export default WaveUI;
