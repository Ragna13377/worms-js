'use client';
import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Plane } from '@react-three/drei';
import { Air } from '@widgets/Air';
import { Water } from '@widgets/Water';

export const HomePage = () => {
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
		setDimensions({
			width: window.innerWidth,
			height: window.innerHeight,
		});
	}, []);

	if (!isClient || dimensions.width === 0 || dimensions.height === 0) {
		return <div>Загрузка...</div>;
	}

	const { width, height } = dimensions;

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
			<Air maxCloudsPerType={4} width={dimensions.width} />
			<Water
				width={width}
				height={height * 0.2}
				position={[0, -height * 0.4, 0]}
				color='#323B7E'
				waveCount={5}
				waveConfig={{
					overlapFactor: 0.2,
				}}
			/>
		</Canvas>
	);
};
