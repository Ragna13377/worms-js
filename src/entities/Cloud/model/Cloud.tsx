'use client';
import { Suspense } from 'react';
import { useSpriteLoader } from '@react-three/drei';
import { CloudProps } from '../types';
import { useCloud } from './hooks/useCloud';
import CloudUI from '../ui/CloudUI';

export const Cloud = ({ name, position, scale, fps, ...hookProps }: CloudProps) => {
	const { cloudRef } = useCloud(hookProps);
	const { spriteObj } = useSpriteLoader(`assets/images/${name}.png`, `assets/data/${name}.json`, [
		name,
	]);

	return (
		<Suspense fallback={null}>
			<CloudUI
				ref={cloudRef}
				position={position}
				scale={scale}
				frameName={name}
				animationNames={[name]}
				spriteDataset={spriteObj}
				fps={fps}
			/>
		</Suspense>
	);
};
