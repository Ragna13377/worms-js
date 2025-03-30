import { Ring } from '@react-three/drei';
import { BubbleUIProps } from '../types';

const BubbleUI = ({ color, position, size, ref }: BubbleUIProps) => (
	<Ring ref={ref} args={size} position={position}>
		<meshBasicMaterial color={color} transparent />
	</Ring>
);

export default BubbleUI;
