'use client';
import { Suspense } from 'react';
import { SpriteAnimator, useSpriteLoader } from '@react-three/drei';
import { CloudUIProps } from '../types';

const CloudUI = ({ source }: CloudUIProps) => {
	const { spriteObj } = useSpriteLoader(
		`assets/images/${source}.png`,
		`assets/data/${source}.json`,
		[source]
	);
	return (
		<Suspense fallback={null}>
			<SpriteAnimator
				position={[0, 0, 0]}
				autoPlay
				loop
				scale={5}
				frameName={source}
				animationNames={[source]}
				spriteDataset={spriteObj}
				alphaTest={0.01}
				asSprite={false}
			/>
		</Suspense>
	);
};

export default CloudUI;
