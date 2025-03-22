import { Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { getRandomInRange } from '@shared/utils/mathUtils';
import { cloudsDelayRange } from '../../constants';
import { CloudBaseProps, CloudProps, TCloudConfig } from '../../types';

export const useCloud = ({
	size,
	airWidth,
	speed,
	direction,
	delayRange,
}: Omit<CloudBaseProps, 'position'> & Pick<TCloudConfig, 'size'>) => {

	const [waiting, setWaiting] = useState(false);
	const cloudRef = useRef<Group>(null);
	const timeoutRef = useRef<NodeJS.Timeout>(null);

	const leftBound = -airWidth / 2 - size;
	const rightBound = airWidth / 2 + size;

	useFrame((_, delta) => {
		if (!cloudRef.current || waiting) return;
		cloudRef.current.position.x += direction * speed * delta;

		if (cloudRef.current.position.x > rightBound || cloudRef.current.position.x < leftBound) {
			setWaiting(true);
			const currentDelay = getRandomInRange(delayRange ?? cloudsDelayRange);
			timeoutRef.current = setTimeout(() => {
				if (cloudRef.current) {
					cloudRef.current.position.x = direction > 0 ? leftBound + 1 : rightBound - 1;
					setWaiting(false);
				}
			}, currentDelay);
		}
	});

	useEffect(
		() => () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		},
		[]
	);
	return {
		cloudRef,
	};
};
