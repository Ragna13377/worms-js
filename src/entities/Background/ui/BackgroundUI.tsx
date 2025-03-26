import { Plane } from '@react-three/drei';
import { BackgroundUIProps } from '../types';
import bgVertexShader from './shaders/background.vert';
import bgFragmentShader from './shaders/background.frag';

const BackgroundUI = ({ position, size, uniform }: BackgroundUIProps) => (
	<Plane args={size} position={position}>
		<shaderMaterial
			vertexShader={bgVertexShader}
			fragmentShader={bgFragmentShader}
			uniforms={uniform}
		/>
	</Plane>
);

export default BackgroundUI;
