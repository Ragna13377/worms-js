'use client';
import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { createWorld } from '@entities/World/model/world';
import { WorldScene } from '@widgets/World/ui/WorldScene';

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
				A / D — камера · R — новая карта · ЛКМ — кратер
				<br />
				Seed {seed} · Курсор: янтарный — грунт, зелёный — пусто
			</div>
			<div
				aria-label={`Ветер ${world.wind < 0 ? 'влево' : 'вправо'}, ${Math.round(Math.abs(world.wind) * 100)}%`}
				style={{
					position: 'absolute',
					right: 22,
					bottom: 22,
					color: '#e1e3f5',
					background: '#242a4b99',
					borderRadius: 5,
					padding: '6px 12px',
					fontSize: 14,
					pointerEvents: 'none',
					display: 'flex',
					alignItems: 'center',
					gap: 8,
				}}
			>
				<span style={{ fontSize: 22 }}>{world.wind < 0 ? '←' : '→'}</span>
				<span>Ветер {Math.round(Math.abs(world.wind) * 100)}%</span>
				<span style={{ width: 42, height: 4, background: '#ffffff26' }}>
					<span
						style={{
							display: 'block',
							height: '100%',
							width: `${Math.abs(world.wind) * 100}%`,
							background: '#c1c5ec',
						}}
					/>
				</span>
			</div>
		</main>
	);
};

HomePage.displayName = 'HomePage';
