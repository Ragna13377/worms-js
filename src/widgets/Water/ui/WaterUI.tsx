import { WaterUIProps } from '../types';
import { Plane } from '@react-three/drei';
import { Wave } from '@entities/Wave';

const WaterUI = ({ width, height, position, color, waveCount, waveConfig }: WaterUIProps) => (
	<>
		<Plane args={[width, height]} position={position}>
			<meshBasicMaterial color={color} />
		</Plane>
		{waveCount > 0 &&
			Array.from({ length: waveCount }, (_, index) => {
				const baseY = position[1] + height / 2;
				const yOffset =
					index === 0
						? baseY
						: baseY - (waveConfig.amplitude * 2 + waveConfig.thickness * 0.1) * index;
				return <Wave key={index} {...waveConfig} position={[0, yOffset, index]} />;
			})}
	</>
);

export default WaterUI;
