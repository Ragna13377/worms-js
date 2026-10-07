import { botController, isBotTurn } from '@entities/Bot/model/controller';
import { livingTeamWorms, type MatchConfig, teamCurrentHp } from '@entities/Match/model/match';
import { WEAPON } from '@entities/Weapon/model/config';
import { equipmentProgress } from '@entities/Weapon/model/presentation';
import { WORLD_ZOOM, worldLayout } from '@entities/World/model/presentation';
import { clampCameraX, edgePanDirection, type GameWorld } from '@entities/World/model/world';
import { WORM } from '@entities/Worm/model/config';
import { type WormPresentation, WormVisual } from '@entities/Worm/ui/WormVisual';
import { useFrame, useThree } from '@react-three/fiber';
import { viewportScale } from '@shared/lib/viewport';
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react';
import { OrthographicCamera } from 'three';
import { useI18n } from '../../../shared/i18n';
import {
	advanceCamera,
	aftermathWorm,
	createCameraControl,
	createShotCamera,
	panCamera,
	shotCameraTarget,
} from '../model/camera';
import { GameplayControls } from '../model/controls';
import type { GameMode } from '../model/saveGame';
import type { Game } from '../model/simulation';
import {
	activeWorm,
	advanceGame,
	cancelGameInput,
	createGame,
	followCamera,
} from '../model/simulation';
import { canControlWorm, canPrepareTurn } from '../model/turns';
import { DrowningVisuals } from './DrowningVisuals';
import { FuseNotice } from './FuseNotice';
import { MatchHud } from './MatchHud';
import { PauseMenu } from './PauseMenu';
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
	matchConfig,
	onExit,
	initialGame,
	mode = 'pvp',
	active: sessionActive = true,
}: {
	world: GameWorld;
	statusRef: RefObject<HTMLOutputElement | null>;
	onReady: () => void;
	matchConfig: MatchConfig;
	onExit: () => void;
	initialGame?: Game;
	mode?: GameMode;
	active?: boolean;
}) {
	const layout = useMemo(() => worldLayout(world), [world]);
	const game = useMemo(
		() => initialGame ?? createGame(world, matchConfig),
		[world, matchConfig, initialGame]
	);
	const { t } = useI18n();
	const controls = useMemo(() => new GameplayControls(), []);
	const { camera, size, gl } = useThree();
	const zoom = WORLD_ZOOM * viewportScale(size.width, size.height);
	useEffect(() => {
		if (camera instanceof OrthographicCamera) {
			camera.zoom = zoom;
			camera.updateProjectionMatrix();
		}
	}, [camera, zoom]);
	const cameraControl = useMemo(() => createCameraControl(), []);
	const presentation = useMemo<WormPresentation>(() => ({ interpolationAlpha: 0 }), []);
	const lastStatus = useRef(-Infinity);

	const cameraTurn = useRef(-1);
	const aftermathId = useRef<string | null>(null);
	const trackedShot = useRef<number | null>(null);
	const shotCamera = useMemo(() => createShotCamera(), []);
	useEffect(() => {
		if (!sessionActive) return;
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
			if (gl.domElement.dataset.weaponMenu || game.paused) return;
			controls.setEnabled(!isBotTurn(game) && (canControlWorm(game) || canPrepareTurn(game)));
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
	}, [controls, game, gl, sessionActive]);
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
					inside && canControlWorm(game) && !gl.domElement.dataset.weaponMenu
						? event.clientX - bounds.left
						: null,
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
	}, [cameraControl, gl, game]);
	useFrame((_, delta) => {
		if (game.paused || !sessionActive) return;
		controls.setEnabled(!isBotTurn(game) && (canControlWorm(game) || canPrepareTurn(game)));
		const input = controls.consume();
		advanceGame(game, world, input, delta);
		controls.setEnabled(!isBotTurn(game) && (canControlWorm(game) || canPrepareTurn(game)));
		const active = activeWorm(game);
		const shot = game.projectiles[0];
		if (cameraTurn.current !== game.match.turnIndex) {
			cameraTurn.current = game.match.turnIndex;
			aftermathId.current = null;
			Object.assign(shotCamera, createShotCamera());
			cameraControl.following = true;
			cameraControl.panDirection = 0;
		}
		if (
			trackedShot.current !== (shot?.id ?? null) ||
			(game.lastShotResult && game.lastShotResult.id !== shotCamera.resultId)
		) {
			cameraControl.following = true;
			cameraControl.panDirection = 0;
		}
		trackedShot.current = shot?.id ?? null;
		let target = shotCameraTarget(
			shotCamera,
			shot,
			game.lastShotResult,
			game.time,
			game.explosions.effects,
			{
				bottom: camera.position.y - size.height / zoom / 2,
				alpha: game.accumulator / WORM.fixedStep,
			},
			{ worms: game.worms, health: game.healthFeedback }
		);
		if (game.match.turnState === 'SETTLING') {
			const affected = aftermathWorm(game, aftermathId.current);
			if (affected) {
				aftermathId.current = affected.id;
				target = affected.position;
			}
		}
		camera.position.x = target
			? clampCameraX(
					followCamera(camera.position.x, target.x, Math.min(delta, WORM.maxAccumulatedTime)),
					world.width,
					size.width / zoom
				)
			: advanceCamera(
					cameraControl,
					camera.position.x,
					active,
					input,
					delta,
					world.width,
					size.width / zoom
				);
		camera.position.y = followCamera(
			camera.position.y,
			target
				? Math.max(
						-world.height * 0.15,
						Math.min(WEAPON.cameraMaxRise, target.y - (size.height / zoom) * 0.1)
					)
				: layout.cameraY,
			Math.min(delta, WORM.maxAccumulatedTime)
		);
		presentation.interpolationAlpha = game.accumulator / WORM.fixedStep;
		presentation.weapon = game.weapon;
		presentation.healthFeedback = game.healthFeedback;
		presentation.activeWormId = game.match.activeWormId;
		presentation.winner = game.match.result;
		presentation.shotActive = Boolean(shot) || !canControlWorm(game);
		camera.updateMatrixWorld();
		if (statusRef.current && game.time - lastStatus.current >= 0.2) {
			lastStatus.current = game.time;
			statusRef.current.textContent = active
				? `${active.name} · HP ${active.hp} · ${active.animationState}${game.missing ? ` · Spawn ${game.worms.length}/6` : ''}`
				: t('allDead');
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
					knockedBack: worm.knockedBack,
					velocityY: worm.velocity.y,
				}))
			);
			statusRef.current.dataset.equipment = String(
				active && !shot && canControlWorm(game) ? equipmentProgress(active, game.weapon) : 0
			);
			statusRef.current.dataset.turnMarker = String(game.turnMarker);
			statusRef.current.dataset.match = JSON.stringify(game.match);
			statusRef.current.dataset.turnState = game.match.turnState;
			statusRef.current.dataset.turnTimeRemaining = String(game.match.turnTimeRemaining);
			statusRef.current.dataset.turnCursor = String(game.match.turnCursor);
			statusRef.current.dataset.currentTeam = active?.team ?? '';
			statusRef.current.dataset.matchResult = game.match.result ?? '';
			statusRef.current.dataset.livingRed = String(livingTeamWorms(game.worms, 'RED').length);
			statusRef.current.dataset.livingBlue = String(livingTeamWorms(game.worms, 'BLUE').length);
			statusRef.current.dataset.redHp = String(teamCurrentHp(game.worms, 'RED'));
			statusRef.current.dataset.blueHp = String(teamCurrentHp(game.worms, 'BLUE'));
			statusRef.current.dataset.weapon = JSON.stringify(game.weapon);
			statusRef.current.dataset.projectiles = JSON.stringify(game.projectiles);
			statusRef.current.dataset.explosions = JSON.stringify(game.explosions.effects);
			statusRef.current.dataset.cameraMode = target ? (shot ? 'projectile' : 'result') : 'worm';
			statusRef.current.dataset.result = JSON.stringify(game.lastShotResult);
			statusRef.current.dataset.cameraY = String(camera.position.y);
			statusRef.current.dataset.cameraX = String(camera.position.x);
			statusRef.current.dataset.simTime = String(game.time);
			statusRef.current.dataset.botPhase = botController(game).phase;
			statusRef.current.dataset.active = game.match.activeWormId ?? '';
			statusRef.current.dataset.waterLevel = String(world.waterLevel);
			statusRef.current.dataset.worldWidth = String(world.width);
			statusRef.current.dataset.worldSeed = String(world.seed);
			statusRef.current.dataset.wind = String(world.wind);
		}
	}, -2);
	return (
		<Suspense fallback={null}>
			{' '}
			<ReadySignal onReady={onReady} />
			<WeaponVisuals game={game} presentation={presentation} waterLevel={world.waterLevel} />
			<DrowningVisuals game={game} waterLevel={world.waterLevel} />
			<MatchHud game={game} onExit={onExit} />
			<WeaponOverlay game={game} controls={controls} />
			<PauseMenu
				active={sessionActive}
				game={game}
				world={world}
				mode={mode}
				controls={controls}
				onExit={onExit}
			/>
			<FuseNotice game={game} />
			{game.worms.map((worm) => (
				<WormVisual key={worm.id} worm={worm} presentation={presentation} terrain={world.terrain} />
			))}
		</Suspense>
	);
}
