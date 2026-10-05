'use client';
import { createWorld } from '@entities/World/model/world';
import { Canvas } from '@react-three/fiber';
import { WindIndicator } from '@widgets/World/ui/WindIndicator';
import { WorldScene } from '@widgets/World/ui/WorldScene';
import { useEffect, useMemo, useState } from 'react';

export const HomePage = () => {
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const [seed, setSeed] = useState(13377);
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
	if (!world) return <div>Загрузка...</div>;
	return (
		<main style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
			<Canvas
				orthographic
				dpr={[1, 1.5]}
				camera={{ zoom: 1, far: 1000, near: 0.1, position: [0, 0, 100] }}
			>
				<WorldScene world={world} />
			</Canvas>
			<div
				style={{
					position: 'absolute',
					top: 16,
					left: 18,
					pointerEvents: 'none',
					color: '#eee9df',
					fontSize: 12,
					textShadow: '0 1px 3px #252637',
					opacity: 0.8,
				}}
			>
				Края экрана / A / D — камера · R — новая карта · ЛКМ — кратер
				<br />
				Seed {seed} · Курсор: янтарный — грунт, зелёный — пусто
			</div>
			<WindIndicator wind={world.wind} />
		</main>
	);
};

HomePage.displayName = 'HomePage';
