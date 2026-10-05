import { WEAPON } from '@entities/Weapon/model/config';
import { clampCameraX, edgePanDirection, type GameWorld } from '@entities/World/model/world';
import { WORM } from '@entities/Worm/model/config';
import { type WormPresentation, WormVisual } from '@entities/Worm/ui/WormVisual';
import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react';
import { advanceCamera, createCameraControl, panCamera } from '../model/camera';
import { GameplayControls } from '../model/controls';
import {
	activeWorm,
	advanceGame,
	cancelGameInput,
	createGame,
	followCamera,
} from '../model/simulation';
import { type WeaponHud, WeaponOverlay } from './WeaponOverlay';
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
	const game = useMemo(() => createGame(world), [world]);
	const controls = useMemo(() => new GameplayControls(), []);
	const { camera, size, gl } = useThree();
	const cameraControl = useMemo(() => createCameraControl(), []);
	const presentation = useMemo<WormPresentation>(() => ({ interpolationAlpha: 0 }), []);
	const lastStatus = useRef(-Infinity);
	const hud = useMemo<WeaponHud>(() => ({ label: null, power: null, countdown: null }), []);
	const trackedShot = useRef<number | null>(null);
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
		const shot = game.projectiles[0];
		if (trackedShot.current !== (shot?.id ?? null)) {
			cameraControl.following = true;
			cameraControl.panDirection = 0;
		}
		trackedShot.current = shot?.id ?? null;
		camera.position.x = shot
			? clampCameraX(
					followCamera(
						camera.position.x,
						shot.position.x,
						Math.min(delta, WORM.maxAccumulatedTime)
					),
					world.width,
					size.width
				)
			: advanceCamera(
					cameraControl,
					camera.position.x,
					active,
					input,
					delta,
					world.width,
					size.width
				);
		camera.position.y = followCamera(
			camera.position.y,
			shot ? Math.max(0, Math.min(WEAPON.cameraMaxRise, shot.position.y - size.height * 0.25)) : 0,
			Math.min(delta, WORM.maxAccumulatedTime)
		);
		presentation.interpolationAlpha = game.accumulator / WORM.fixedStep;
		presentation.weapon = game.weapon;
		presentation.activeWormId = game.debugActiveWormId;
		presentation.shotActive = Boolean(shot);
		if (hud.power) hud.power.value = game.weapon.charge;
		if (hud.label)
			hud.label.textContent =
				game.weapon.selectedWeapon === 'bazooka'
					? 'Bazooka'
					: `Grenade · ${game.weapon.grenadeFuse} s`;
		if (hud.countdown)
			hud.countdown.textContent =
				shot?.type === 'grenade'
					? `Взрыв через ${Math.max(0, shot.fuse - shot.age).toFixed(1)} s`
					: game.weapon.isCharging
						? `${Math.round(game.weapon.charge * 100)}%`
						: '';
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
			statusRef.current.dataset.weapon = JSON.stringify(game.weapon);
			statusRef.current.dataset.projectiles = JSON.stringify(game.projectiles);
			statusRef.current.dataset.explosions = JSON.stringify(game.explosions.effects);
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
			<WeaponVisuals game={game} presentation={presentation} />
			<WeaponOverlay game={game} controls={controls} hud={hud} />
			{game.worms.map((worm) => (
				<WormVisual key={worm.id} worm={worm} presentation={presentation} terrain={world.terrain} />
			))}
		</Suspense>
	);
}
