import { Bubble } from '@entities/Bubble';
import { Wave } from '@entities/Wave';
import { Plane } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { type Mesh, OrthographicCamera } from 'three';
import { waterCoverage } from '../model/coverage';
import type { WaterUIProps } from '../types';
import { RearWaterFill } from './RearWaterFill';

const WaterUI = ({ width, height, position, color, waves, bubbles }: WaterUIProps) => {
	const ref = useRef<Mesh>(null);
	const top = position[1] + height / 2;
	const rearWave = waves.find((wave) => wave.depth !== undefined && wave.depth < 3);
	useFrame(({ camera, size }) => {
		if (!ref.current) return;
		const viewportHeight = size.height / (camera instanceof OrthographicCamera ? camera.zoom : 1);
		const coverage = waterCoverage(
			top,
			position[1] - height / 2,
			camera.position.y,
			viewportHeight
		);
		ref.current.position.y = coverage.y;
		ref.current.scale.y = coverage.height / height;
	});
	return (
		<>
			{rearWave && (
				<RearWaterFill wave={rearWave} bottom={position[1] - height / 2} color={color} />
			)}
			<Plane ref={ref} args={[width, height]} position={position}>
				<meshBasicMaterial color={color} />
			</Plane>
			{bubbles.map((bubble, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: Stable ambient bubble slots.
				<Bubble key={index} {...bubble} />
			))}
			{waves.map((wave, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: Stable wave layers.
				<Wave key={index} index={index} {...wave} />
			))}
		</>
	);
};

WaterUI.displayName = 'WaterUI';
export default WaterUI;
