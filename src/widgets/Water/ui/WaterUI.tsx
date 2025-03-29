import { Plane } from '@react-three/drei';
import { Bubble } from '@entities/Bubble';
import { Wave } from '@entities/Wave';
import { WaterUIProps } from '../types';

const WaterUI = ({ width, height, position, color, waves, bubbles }: WaterUIProps) => (
	<>
		<Plane args={[width, height]} position={position}>
			<meshBasicMaterial color={color} />
		</Plane>
		{bubbles.map((bubble, index) => (
			<Bubble key={index} {...bubble} />
		))}
		{waves.map((wave, index) => (
			<Wave key={index} index={index} {...wave} />
		))}
	</>
);

export default WaterUI;
