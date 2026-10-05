import { bubbleTypes } from '@entities/Bubble/constants';
import type { BubbleProps } from '@entities/Bubble/types';
import { useFrame } from '@react-three/fiber';
import { getRandomInRange } from '@shared/utils/mathUtils';
import { useMemo, useRef } from 'react';
import { type Mesh, type MeshBasicMaterial, Vector3 } from 'three';

export const useBubbleAnimation = ({
	type,
	xRange,
	yRange,
	fadeRange,
	config,
	wind = 0,
}: BubbleProps) => {
	const bubbleRef = useRef<Mesh>(null);
	const { size, speed } = bubbleTypes[type];
	const { amplitude, frequency, wobbleSpeed, wobbleIntensity, delay, color } = config;
	const [yMin, yMax] = yRange.range;
	const [fadeMin, fadeMax] = fadeRange.range;
	const motion = useMemo(
		() => ({
			x: getRandomInRange(xRange),
			y: yMin,
			speed: getRandomInRange(speed),
		}),
		[xRange, yMin, speed]
	);
	const position = useMemo(() => new Vector3(motion.x, motion.y, 7), [motion]);
	useFrame(({ clock }, delta) => {
		const bubble = bubbleRef.current;
		if (!bubble) return;
		const time = clock.elapsedTime;
		const dt = Math.min(delta, 0.05);
		motion.y += motion.speed * dt;
		motion.x += wind * 24 * dt;
		if (motion.x > xRange.range[1]) motion.x = xRange.range[0];
		if (motion.x < xRange.range[0]) motion.x = xRange.range[1];
		let opacity = 1;
		if (motion.y > fadeMin) {
			const overflow = Math.min(1, (motion.y - fadeMin) / Math.max(1, fadeMax - fadeMin));
			opacity = 1 - overflow ** 2;
		}
		if (motion.y > yMax) {
			motion.y = yMin - getRandomInRange(delay);
			motion.x = getRandomInRange(xRange);
			opacity = 1;
		}
		const wobble = time * wobbleSpeed;
		bubble.position.set(
			motion.x + Math.sin(time * frequency) * amplitude + Math.sin(wobble) * wobbleIntensity,
			motion.y + Math.cos(wobble) * wobbleIntensity,
			7
		);
		(bubble.material as MeshBasicMaterial).opacity = opacity;
	});
	return { bubbleRef, size, position, color };
};
