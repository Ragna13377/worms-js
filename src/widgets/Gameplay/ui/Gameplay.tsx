import { WEAPON } from '@entities/Weapon/model/config';
import { equipmentProgress } from '@entities/Weapon/model/presentation';
import { WORLD_ZOOM, worldLayout } from '@entities/World/model/presentation';
import { clampCameraX, edgePanDirection, type GameWorld } from '@entities/World/model/world';
import { WORM } from '@entities/Worm/model/config';
import { type WormPresentation, WormVisual } from '@entities/Worm/ui/WormVisual';
import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react';
import {
	advanceCamera,
	createCameraControl,
	createShotCamera,
	panCamera,
	shotCameraTarget,
} from '../model/camera';
import { GameplayControls } from '../model/controls';
import {
	activeWorm,
	advanceGame,
	cancelGameInput,
	createGame,
	followCamera,
} from '../model/simulation';
import { WeaponOverlay } from './WeaponOverlay';
import { WeaponVisuals } from './WeaponVisuals';

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
	const layout = useMemo(() => worldLayout(world), [world]);
	const game = useMemo(() => createGame(world), [world]);
	const controls = useMemo(() => new GameplayControls(), []);
	const { camera, size, gl } = useThree();
	const cameraControl = useMemo(() => createCameraControl(), []);
	const presentation = useMemo<WormPresentation>(() => ({ interpolationAlpha: 0 }), []);
	const lastStatus = useRef(-Infinity);

	const trackedShot = useRef<number | null>(null);
	const shotCamera = useMemo(() => createShotCamera(), []);
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
			if (gl.domElement.dataset.weaponMenu) return;
			if (controls.press(event.code, event.repeat)) {
				event.preventDefault();
			}
		};
		const up = (event: KeyboardEvent) => controls.release(event.code);
		const clear = () => {
			controls.clear();
			cancelGameInput(game);
		};
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
	}, [controls, game, gl]);
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
				edgePanDirection(
					inside && !gl.domElement.dataset.weaponMenu ? event.clientX - bounds.left : null,
					bounds.width
				)
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
		const shot = game.projectiles[0];
		if (
			trackedShot.current !== (shot?.id ?? null) ||
			(game.lastShotResult && game.lastShotResult.id !== shotCamera.resultId)
		) {
			cameraControl.following = true;
			cameraControl.panDirection = 0;
		}
		trackedShot.current = shot?.id ?? null;
		const target = shotCameraTarget(
			shotCamera,
			shot,
			game.lastShotResult,
			game.time,
			game.explosions.effects,
			{
				bottom: camera.position.y - size.height / WORLD_ZOOM / 2,
				alpha: game.accumulator / WORM.fixedStep,
			}
		);
		camera.position.x = target
			? clampCameraX(
					followCamera(camera.position.x, target.x, Math.min(delta, WORM.maxAccumulatedTime)),
					world.width,
					size.width / WORLD_ZOOM
				)
			: advanceCamera(
					cameraControl,
					camera.position.x,
					active,
					input,
					delta,
					world.width,
					size.width / WORLD_ZOOM
				);
		camera.position.y = followCamera(
			camera.position.y,
			target
				? Math.max(
						-world.height * 0.15,
						Math.min(WEAPON.cameraMaxRise, target.y - (size.height / WORLD_ZOOM) * 0.1)
					)
				: layout.cameraY,
			Math.min(delta, WORM.maxAccumulatedTime)
		);
		presentation.interpolationAlpha = game.accumulator / WORM.fixedStep;
		presentation.weapon = game.weapon;
		presentation.activeWormId = game.debugActiveWormId;
		presentation.shotActive = Boolean(shot);
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
			statusRef.current.dataset.equipment = String(
				active && !shot ? equipmentProgress(active, game.weapon) : 0
			);
			statusRef.current.dataset.turnMarker = String(game.turnMarker);
			statusRef.current.dataset.weapon = JSON.stringify(game.weapon);
			statusRef.current.dataset.projectiles = JSON.stringify(game.projectiles);
			statusRef.current.dataset.explosions = JSON.stringify(game.explosions.effects);
			statusRef.current.dataset.cameraMode = target ? (shot ? 'projectile' : 'result') : 'worm';
			statusRef.current.dataset.result = JSON.stringify(game.lastShotResult);
			statusRef.current.dataset.cameraY = String(camera.position.y);
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
			<WeaponVisuals game={game} presentation={presentation} waterLevel={world.waterLevel} />
			<WeaponOverlay game={game} controls={controls} />
			{game.worms.map((worm) => (
				<WormVisual key={worm.id} worm={worm} presentation={presentation} terrain={world.terrain} />
			))}
		</Suspense>
	);
}
