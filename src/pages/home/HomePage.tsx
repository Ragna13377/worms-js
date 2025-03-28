'use client';
import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Air } from '@widgets/Air';
import { Water } from '@widgets/Water';
import { cloudBandGap } from '@widgets/Air/constants';
import { Background } from '@entities/Background';
import { sceneColors } from '@pages/home/constants';

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
	const waterHeight = height * 0.25;
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
				position: [0, 0, 100],
			}}
		>
			<Background
				size={[width, height]}
				position={[0, 0, 0]}
				shader={{
					uBottomColor: sceneColors.bgBottomColor,
					uTopColor: sceneColors.bgTopColor,
				}}
			/>
			<Air maxCloudsPerType={4} height={height / 2 - cloudBandGap} width={width} />
			<Water
				width={width}
				height={waterHeight}
				position={[0, -height * 0.5 + waterHeight * 0.5, 0]}
				color={sceneColors.waterColor}
				waveCount={5}
				waveConfig={{
					overlapFactor: 0.2,
					shaderConfig: {
						uColorFrom: sceneColors.waveColorFrom,
						uColorTo: sceneColors.waveColorTo,
					},
				}}
				bubbleConfig={{
					color: sceneColors.bubbleColor,
				}}
			/>
		</Canvas>
	);
};
