import { WaterUIProps } from '../types';
import { Plane } from '@react-three/drei';
import { Wave } from '@entities/Wave';
import { phaseOffsetGenerator, WaveOffsetCalculation } from '@widgets/Water/utils';

const WaterUI = ({ width, height, position, color, waveParameters }: WaterUIProps) => {
	const { waveCount, waveConfig, overlapFactor } = waveParameters;
	const phaseOffsetGen = phaseOffsetGenerator(waveParameters.waveCount);
	return (
		<>
			<Plane args={[width, height]} position={position}>
				<meshBasicMaterial color={color} />
			</Plane>
			{Array.from({ length: waveCount }, (_, index) => {
				const yOffset = WaveOffsetCalculation({
					index,
					baseY: position[1] + height / 2,
					amplitude: waveConfig.amplitude,
					thickness: waveConfig.thickness,
					overlapFactor,
				});
				const phaseOffset = phaseOffsetGen.next().value;
				return (
					<Wave
						key={index}
						{...waveConfig}
						width={width}
						phaseOffset={phaseOffset as number}
						position={[0, yOffset, index]}
					/>
				);
			})}
		</>
	);
};

export default WaterUI;
