import { Plane } from '@react-three/drei';
import { Wave } from '@entities/Wave';
import { WaterUIProps } from '../types';

const WaterUI = ({
	width,
	height,
	position,
	color,
	offsets,
	waveCount,
	waveConfig,
}: WaterUIProps) => {
	const { amplitude, thickness, overlapFactor } = waveConfig;
	return (
		<>
			<Plane args={[width, height]} position={position}>
				<meshBasicMaterial color={color} />
			</Plane>
			{Array.from({ length: waveCount }, (_, index) => {
				const yOffset =
					position[1] + height / 2 - (amplitude * 2 + thickness * overlapFactor) * index;
				return (
					<Wave
						key={index}
						{...waveConfig}
						width={width}
						phaseOffset={offsets[index]}
						position={[0, yOffset, index]}
					/>
				);
			})}
		</>
	);
};

export default WaterUI;
