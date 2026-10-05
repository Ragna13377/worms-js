import { clampCameraX, type GameWorld } from '@entities/World/model/world';
import { WORM } from '@entities/Worm/model/config';
import { WormVisual } from '@entities/Worm/ui/WormVisual';
import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react';
import { GameplayControls } from '../model/controls';
import { activeWorm, advanceGame, createGame, followCamera } from '../model/simulation';

export function Gameplay({
	world,
	statusRef,
}: {
	world: GameWorld;
	statusRef: RefObject<HTMLOutputElement | null>;
}) {
	const game = useMemo(() => createGame(world), [world]);
	const controls = useMemo(() => new GameplayControls(), []);
	const { camera, size } = useThree();
	const lastStatus = useRef(-Infinity);
	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				(event.target instanceof HTMLElement &&
					(event.target.isContentEditable ||
						['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)))
			)
				return;
			if (controls.press(event.code, event.repeat)) {
				event.preventDefault();
			}
		};
		const up = (event: KeyboardEvent) => controls.release(event.code);
		const clear = () => controls.clear();
		const visibility = () => {
			if (document.hidden) clear();
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('blur', clear);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('blur', clear);
			document.removeEventListener('visibilitychange', visibility);
			clear();
		};
	}, [controls]);
	useFrame((_, delta) => {
		const input = controls.consume();
		advanceGame(game, world, input, delta);
		const active = activeWorm(game);
		if (active)
			camera.position.x = clampCameraX(
				followCamera(
					camera.position.x,
					active.position.x,
					Math.min(delta, WORM.maxAccumulatedTime)
				),
				world.width,
				size.width
			);
		else camera.position.x = clampCameraX(camera.position.x, world.width, size.width);
		camera.updateMatrixWorld();
		if (statusRef.current && game.time - lastStatus.current >= 0.2) {
			lastStatus.current = game.time;
			statusRef.current.textContent = active
				? `${active.id} · HP ${active.hp} · ${active.animationState}${game.missing ? ` · Spawn ${game.worms.length}/6` : ''}`
				: 'Все черви погибли · R — новая карта';
			// DOM-backed diagnostics for browser QA; never a second simulation source of truth.
			statusRef.current.dataset.worms = JSON.stringify(
				game.worms.map((worm) => ({
					id: worm.id,
					x: worm.position.x,
					y: worm.position.y,
					hp: worm.hp,
					alive: worm.alive,
					state: worm.animationState,
					facing: worm.facing,
					grounded: worm.grounded,
					jumpType: worm.jumpType,
				}))
			);
			statusRef.current.dataset.cameraX = String(camera.position.x);
			statusRef.current.dataset.simTime = String(game.time);
			statusRef.current.dataset.active = game.debugActiveWormId ?? '';
			statusRef.current.dataset.waterLevel = String(world.waterLevel);
			statusRef.current.dataset.worldWidth = String(world.width);
		}
	}, -2);
	return (
		<Suspense fallback={null}>
			{game.worms.map((worm) => (
				<WormVisual key={worm.id} worm={worm} game={game} />
			))}
		</Suspense>
	);
}
