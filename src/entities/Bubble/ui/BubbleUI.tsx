import { Ring } from '@react-three/drei';
import { BubbleUIProps } from '../types';
import bubbleVertexShader from './shaders/bubble.vert';
import bubbleFragmentShader from './shaders/bubble.frag';

const BubbleUI = ({ uniforms, position, size, ref }: BubbleUIProps) => (
	<Ring ref={ref} args={size} position={position}>
		<shaderMaterial
			vertexShader={bubbleVertexShader}
			fragmentShader={bubbleFragmentShader}
			uniforms={uniforms}
		/>
	</Ring>
);

export default BubbleUI;
