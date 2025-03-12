'use client';
import { Canvas } from '@react-three/fiber';
import { Plane } from '@react-three/drei';
import { Water } from '@widgets/Water';

export const HomePage = () => {
	if (typeof window === 'undefined') {
		return null;
	}
	const width = window.innerWidth;
	const height = window.innerHeight;

	return (
		<Canvas
			orthographic
			camera={{
				left: width / -2,
				right: width / 2,
				top: height / 2,
				bottom: height / -2,
				far: 1000,
				near: 1,
			}}
		>
			<Plane args={[width, height * 0.8]} position={[0, height * 0.1, 0]}>
				<meshBasicMaterial color='skyblue' />
			</Plane>
			<Water
				width={width}
				height={height * 0.2}
				position={[0, -height * 0.4, 0]}
				color='#323B7E'
				waveCount={5}
			/>
		</Canvas>
	);
};
