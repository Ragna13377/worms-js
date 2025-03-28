import { Plane } from '@react-three/drei';
import { Bubble } from '@entities/Bubble';
import { Wave } from '@entities/Wave';
import { WaterUIProps } from '../types';

const WaterUI = ({
	width,
	height,
	position,
	color,
	bubbles,
	waveCount,
	baseWaveYPos,
	waveOffsets,
	waveConfig,
}: WaterUIProps) => (
	<>
		<Plane args={[width, height]} position={position}>
			<meshBasicMaterial color={color} />
		</Plane>
		{bubbles.map((bubble, index) => (
			<Bubble key={index} {...bubble} />
		))}
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
