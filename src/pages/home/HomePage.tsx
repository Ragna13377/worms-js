'use client';
import { WORLD_ZOOM } from '@entities/World/model/presentation';
import { Canvas } from '@react-three/fiber';
import { initializeLanguage, useI18n } from '@shared/i18n';
import { LoadingScreen } from '@shared/ui/LoadingScreen';
import { createMatchWorld } from '@widgets/Gameplay/model/matchWorld';
import { deleteSavedGame, restoreSnapshot, type SavedGame } from '@widgets/Gameplay/model/saveGame';
import { createGame } from '@widgets/Gameplay/model/simulation';
import { MainMenu } from '@widgets/MainMenu/ui/MainMenu';
import { WindIndicator } from '@widgets/World/ui/WindIndicator';
import { WorldScene } from '@widgets/World/ui/WorldScene';
import { useCallback, useEffect, useRef, useState } from 'react';

type Session = ReturnType<typeof restoreSnapshot>;
export const HomePage = () => {
	const { t } = useI18n();
	const [session, setSession] = useState<Session>();
	const [exited, setExited] = useState(true);
	const [sceneReady, setSceneReady] = useState(false);
	const [generation, setGeneration] = useState(0);
	const markReady = useCallback(() => setSceneReady(true), []);
	const statusRef = useRef<HTMLOutputElement>(null);
	const start = useCallback(async (count: number) => {
		const config = { RED: count, BLUE: count };
		const seed = crypto.getRandomValues(new Uint32Array(1))[0];
		const world = createMatchWorld(window.innerWidth, window.innerHeight, seed, config);
		const game = createGame(world, config);
		await deleteSavedGame();
		setSession({ world, game, mode: 'pvp' });
		setGeneration((value) => value + 1);
		setSceneReady(false);
		setExited(false);
	}, []);
	const load = useCallback((save: SavedGame) => {
		const restored = restoreSnapshot(save);
		setSession(restored);
		setGeneration((value) => value + 1);
		setSceneReady(false);
		setExited(false);
	}, []);
	useEffect(() => {
		initializeLanguage();
		const preventBrowserSelection = (event: Event) => event.preventDefault();
		document.addEventListener('dragstart', preventBrowserSelection, true);
		document.addEventListener('selectstart', preventBrowserSelection, true);
		return () => {
			document.removeEventListener('dragstart', preventBrowserSelection, true);
			document.removeEventListener('selectstart', preventBrowserSelection, true);
		};
	}, []);
	return (
		<main
			role='application'
			// biome-ignore lint/a11y/noNoninteractiveTabindex: Game surface accepts keyboard controls.
			tabIndex={0}
			aria-label={t('gameLabel')}
			style={{
				width: '100%',
				height: '100%',
				position: 'relative',
				overflow: 'hidden',
				cursor: exited ? 'default' : 'none',
			}}
		>
			{session && (
				<Canvas
					frameloop={exited ? 'never' : 'always'}
					style={{ visibility: exited ? 'hidden' : 'visible' }}
					orthographic
					dpr={[1, 1.5]}
					camera={{ zoom: WORLD_ZOOM, far: 1000, near: 0.1, position: [0, 0, 100] }}
				>
					<WorldScene
						active={!exited}
						key={generation}
						world={session.world}
						initialGame={session.game}
						mode={session.mode}
						matchConfig={session.game.match.config}
						statusRef={statusRef}
						onReady={markReady}
						onExit={() => setExited(true)}
					/>
				</Canvas>
			)}
			<output ref={statusRef} data-testid='worm-status' hidden />
			{session && !exited && (
				<>
					<WindIndicator world={session.world} />
					<LoadingScreen key={generation} ready={sceneReady} />
				</>
			)}
			{exited && <MainMenu onStart={start} onLoad={load} />}
		</main>
	);
};
HomePage.displayName = 'HomePage';
