'use client';
import { BubbleProps } from '../types';
import { useBubbleAnimation } from './hooks/useBubbleAnimation';
import BubbleUI from '../ui/BubbleUI';

export const Bubble = (props: BubbleProps) => {
	const { bubbleRef, ...rest } = useBubbleAnimation(props);
	return <BubbleUI ref={bubbleRef} {...rest} />;
};

Bubble.displayName = 'Bubble';
