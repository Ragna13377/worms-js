import { edgePanDirection, type GameWorld } from '@entities/World/model/world';
import { WORM } from '@entities/Worm/model/config';
import { WormVisual } from '@entities/Worm/ui/WormVisual';
import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react';
import { advanceCamera, createCameraControl, panCamera } from '../model/camera';
import { GameplayControls } from '../model/controls';
import { activeWorm, advanceGame, createGame } from '../model/simulation';

function ReadySignal({ onReady }: { onReady: () => void }) {
	const sent = useRef(false);
	useFrame(() => {
		if (!sent.current) {
			sent.current = true;
			onReady();
		}
	});
	return null;
}

export function Gameplay({
	world,
	statusRef,
	onReady,
}: {
	world: GameWorld;
	statusRef: RefObject<HTMLOutputElement | null>;
	onReady: () => void;
}) {
	const game = useMemo(() => createGame(world), [world]);
	const controls = useMemo(() => new GameplayControls(), []);
	const { camera, size, gl } = useThree();
	const cameraControl = useMemo(() => createCameraControl(), []);
	const presentation = useMemo(() => ({ interpolationAlpha: 0 }), []);
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
	useEffect(() => {
		const move = (event: PointerEvent) => {
			const bounds = gl.domElement.getBoundingClientRect();
			const inside =
				event.clientX >= bounds.left &&
				event.clientX <= bounds.right &&
				event.clientY >= bounds.top &&
				event.clientY <= bounds.bottom;
			panCamera(
				cameraControl,
				edgePanDirection(inside ? event.clientX - bounds.left : null, bounds.width)
			);
		};
		const leave = () => panCamera(cameraControl, 0);
		window.addEventListener('pointermove', move);
		window.addEventListener('blur', leave);
		gl.domElement.addEventListener('pointerleave', leave);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('blur', leave);
			gl.domElement.removeEventListener('pointerleave', leave);
		};
	}, [cameraControl, gl]);
	useFrame((_, delta) => {
		const input = controls.consume();
		advanceGame(game, world, input, delta);
		const active = activeWorm(game);
		camera.position.x = advanceCamera(
			cameraControl,
			camera.position.x,
			active,
			input,
			delta,
			world.width,
			size.width
		);
		presentation.interpolationAlpha = game.accumulator / WORM.fixedStep;
		camera.updateMatrixWorld();
		if (statusRef.current && game.time - lastStatus.current >= 0.2) {
			lastStatus.current = game.time;
			statusRef.current.textContent = active
				? `${active.name} · HP ${active.hp} · ${active.animationState}${game.missing ? ` · Spawn ${game.worms.length}/6` : ''}`
				: 'Все черви погибли · R — новая карта';
			// DOM-backed diagnostics for browser QA; never a second simulation source of truth.
			statusRef.current.dataset.worms = JSON.stringify(
				game.worms.map((worm) => ({
					id: worm.id,
					name: worm.name,
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
			{' '}
			<ReadySignal onReady={onReady} />
			{game.worms.map((worm) => (
				<WormVisual key={worm.id} worm={worm} presentation={presentation} terrain={world.terrain} />
			))}
		</Suspense>
	);
}
