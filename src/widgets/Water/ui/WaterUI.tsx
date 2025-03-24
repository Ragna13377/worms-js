import { Plane } from '@react-three/drei';
import { Wave } from '@entities/Wave';
import { WaterUIProps } from '../types';
import { Bubble } from '@entities/Bubble';

const WaterUI = ({
	width,
	height,
	position,
	color,
	waveCount,
	baseWaveYPos,
	waveOffsets,
	waveConfig,
}: WaterUIProps) => (
	<>
		<Plane args={[width, height]} position={position}>
			<meshBasicMaterial color={color} />
		</Plane>
		<Bubble type='medium' />
		{Array.from({ length: waveCount }, (_, index) => (
			<Wave
				key={index}
				index={index}
				baseYPos={baseWaveYPos}
				width={width}
				phaseOffset={waveOffsets[index]}
				{...waveConfig}
			/>
		))}
	</>
);

export default WaterUI;
