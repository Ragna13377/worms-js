import { Ring } from '@react-three/drei';
import { BubbleUIProps } from '../types';

const BubbleUI = ({ color, position, size, ref }: BubbleUIProps) => (
	<Ring ref={ref} args={size} position={position}>
		<meshBasicMaterial color={color} transparent />
	</Ring>
);

BubbleUI.displayName = 'BubbleUI';
export default BubbleUI;
