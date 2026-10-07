'use client';
import type { MatchConfig } from '@entities/Match/model/match';
import { WORLD_ZOOM } from '@entities/World/model/presentation';
import { Canvas } from '@react-three/fiber';
import { initializeLanguage, useI18n } from '@shared/i18n';
import { logicalViewport } from '@shared/lib/viewport';
import { LoadingScreen } from '@shared/ui/LoadingScreen';
import { NetworkPing, OnlineStatus } from '@shared/ui/OnlineStatus';
import { createMatchWorld } from '@widgets/Gameplay/model/matchWorld';
import { deleteSavedGame, restoreSnapshot, type SavedGame } from '@widgets/Gameplay/model/saveGame';
import { createGame } from '@widgets/Gameplay/model/simulation';
import { MainMenu } from '@widgets/MainMenu/ui/MainMenu';
import { WindIndicator } from '@widgets/World/ui/WindIndicator';
import { WorldScene } from '@widgets/World/ui/WorldScene';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LobbyClient } from '../../shared/realtime/client';
import { OnlineMatch } from '../../shared/realtime/onlineMatch';

type Session = Omit<ReturnType<typeof restoreSnapshot>, 'mode'> & {
	mode: 'pvp' | 'bot' | 'lobby';
	online?: OnlineMatch;
};
export const HomePage = () => {
	const { t } = useI18n();
	const [onlineClient] = useState(() => new LobbyClient());
	const onlineRef = useRef<OnlineMatch | undefined>(undefined);
	const [onlineError, setOnlineError] = useState<string>();
	const [network, setNetwork] = useState<{ code?: string; progress?: number; ping?: number }>({});
	const [session, setSession] = useState<Session>();
	const [exited, setExited] = useState(true);
	const [sceneReady, setSceneReady] = useState(false);
	const [generation, setGeneration] = useState(0);
	const markReady = useCallback(() => {
		setSceneReady(true);
		onlineRef.current?.ready();
	}, []);
	const exit = useCallback(() => {
		onlineRef.current?.dispose();
		onlineRef.current = undefined;
		onlineClient.leave();
		setOnlineError(undefined);
		setNetwork({});
		setExited(true);
		const url = new URL(window.location.href);
		url.searchParams.delete('room');
		window.history.replaceState(null, '', url);
	}, [onlineClient]);
	useEffect(() => {
		const unsubscribe = onlineClient.onMessage((message) => {
			if (message.type !== 'MATCH_PREPARE') return;
			if (onlineRef.current?.config.matchId === message.config.matchId) return;
			const seat = onlineClient.snapshot.credential?.seat;
			if (!seat) return;
			try {
				const online = new OnlineMatch(onlineClient, message.config, seat, message.recovering);
				online.onRestored = () => {
					setSession({ ...online.simulation, online });
					setGeneration((v) => v + 1);
					setSceneReady(false);
				};
				onlineRef.current = online;
				setSession({ ...online.simulation, online });
				setGeneration((v) => v + 1);
				setSceneReady(false);
				setExited(false);
			} catch {
				setOnlineError('PREPARE_FAILED');
				onlineClient.send({
					type: 'MATCH_FAIL',
					matchId: message.config.matchId,
					code: 'PREPARE_FAILED',
				});
			}
		});
		const timer = window.setInterval(() => {
			if (onlineRef.current?.error) setOnlineError(onlineRef.current.error);
			const online = onlineRef.current;
			if (online)
				setNetwork({
					code: online.status,
					progress: online.status === 'restoringMatch' ? online.recoveryProgress : undefined,
					ping: onlineClient.snapshot.ping,
				});
		}, 200);
		return () => {
			unsubscribe();
			window.clearInterval(timer);
			onlineRef.current?.dispose();
			onlineClient.disconnect();
		};
	}, [onlineClient]);
	const statusRef = useRef<HTMLOutputElement>(null);
	const start = useCallback(async (count: number, mode: 'pvp' | 'bot') => {
		const config: MatchConfig = {
			RED: count,
			BLUE: count,
			mode:
				mode === 'bot' ? { type: 'bot', humanTeam: 'RED', botTeam: 'BLUE' } : { type: 'hotseat' },
		};
		const seed = crypto.getRandomValues(new Uint32Array(1))[0];
		const viewport = logicalViewport(window.innerWidth, window.innerHeight);
		const world = createMatchWorld(viewport.width, viewport.height, seed, config);
		const game = createGame(world, config);
		await deleteSavedGame();
		setSession({ world, game, mode });
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
						online={session.online}
						matchConfig={session.game.match.config}
						statusRef={statusRef}
						onReady={markReady}
						onExit={exit}
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
			{session?.online && !exited && (
				<div style={{ position: 'absolute', top: 12, right: 12, zIndex: 90 }}>
					<NetworkPing ping={network.ping} label={false} />
				</div>
			)}
			{!exited && (onlineError || network.code) && (
				<OnlineStatus
					code={onlineError ?? network.code ?? 'connecting'}
					progress={network.progress}
					busy={!onlineError}
					onExit={exit}
				/>
			)}
			{exited && <MainMenu onlineClient={onlineClient} onStart={start} onLoad={load} />}
		</main>
	);
};
HomePage.displayName = 'HomePage';
