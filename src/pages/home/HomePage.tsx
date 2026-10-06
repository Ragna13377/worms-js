'use client';
import { WORLD_ZOOM } from '@entities/World/model/presentation';
import { createWorld } from '@entities/World/model/world';
import { Canvas } from '@react-three/fiber';
import { LoadingScreen } from '@shared/ui/LoadingScreen';
import { WindIndicator } from '@widgets/World/ui/WindIndicator';
import { WorldScene } from '@widgets/World/ui/WorldScene';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const HomePage = () => {
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const [seed, setSeed] = useState(13377);
	const [sceneReady, setSceneReady] = useState(false);
	const markReady = useCallback(() => setSceneReady(true), []);
	const statusRef = useRef<HTMLOutputElement>(null);
	useEffect(() => {
		const resize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
		const regenerate = (event: KeyboardEvent) => {
			if (
				event.code === 'KeyR' &&
				!event.repeat &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey
			)
				setSeed((previous) => (previous + 0x9e3779b9) >>> 0);
		};
		resize();
		window.addEventListener('resize', resize);
		window.addEventListener('keydown', regenerate);
		return () => {
			window.removeEventListener('resize', resize);
			window.removeEventListener('keydown', regenerate);
		};
	}, []);
	const world = useMemo(
		() =>
			dimensions.width && dimensions.height
				? createWorld(dimensions.width, dimensions.height, seed)
				: null,
		[dimensions, seed]
	);

	return (
		<main
			role='application'
			// biome-ignore lint/a11y/noNoninteractiveTabindex: The game surface accepts keyboard movement and jump controls.
			tabIndex={0}
			aria-label='Worms sandbox'
			style={{
				width: '100%',
				height: '100%',
				position: 'relative',
				overflow: 'hidden',
				cursor: 'none',
			}}
		>
			{world && (
				<Canvas
					orthographic
					dpr={[1, 1.5]}
					camera={{ zoom: WORLD_ZOOM, far: 1000, near: 0.1, position: [0, 0, 100] }}
				>
					<WorldScene world={world} statusRef={statusRef} onReady={markReady} />
				</Canvas>
			)}
			<output ref={statusRef} data-testid='worm-status' hidden />
			{world && <WindIndicator wind={world.wind} />} <LoadingScreen ready={sceneReady} />
		</main>
	);
};

HomePage.displayName = 'HomePage';
