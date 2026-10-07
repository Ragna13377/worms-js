import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { inviteUrl, LobbyClient, type LobbyView } from '../../../shared/realtime/client';
import styles from './MainMenu.module.css';

export function OnlineLobby({ roomId, onLeave }: { roomId?: string; onLeave: () => void }) {
	const { t } = useI18n();
	const [view, setView] = useState<LobbyView>({ status: 'idle' });
	const [code, setCode] = useState(roomId ?? '');
	const [copied, setCopied] = useState(false);
	const client = useRef<LobbyClient | null>(null);
	if (!client.current) client.current = new LobbyClient(setView);
	useEffect(() => () => client.current?.disconnect(), []);
	const credential = view.credential;
	useEffect(() => {
		if (credential)
			window.history.replaceState(null, '', inviteUrl(window.location.href, credential.roomId));
	}, [credential]);
	const peerConnected =
		credential?.seat === 'HOST' ? view.room?.guestConnected : view.room?.hostConnected;
	return (
		<div className={`${styles.setupBody} ${styles.scroller} ${styles.lobbyBody}`}>
			<p>{t('lobbyLimitation')}</p>
			{!credential ? (
				<>
					{!roomId && (
						<button
							type='button'
							className={styles.primary}
							disabled={view.status === 'connecting'}
							onClick={() => void client.current?.createRoom()}
						>
							{t('createLobby')}
						</button>
					)}
					<label className={styles.fieldset}>
						{t('roomCode')}
						<input
							aria-label={t('roomCode')}
							value={code}
							maxLength={6}
							autoComplete='off'
							onChange={(event) => setCode(event.target.value.toUpperCase())}
						/>
					</label>
					<button
						type='button'
						className={styles.primary}
						disabled={view.status === 'connecting' || code.length !== 6}
						onClick={() => void client.current?.joinRoom(code)}
					>
						{t('joinLobby')}
					</button>
				</>
			) : (
				<>
					<h2>
						{t('roomCode')}: <span data-testid='room-code'>{credential.roomId}</span>
					</h2>
					<p>
						{credential.seat} / {t(credential.seat === 'HOST' ? 'RED' : 'BLUE')}
					</p>
					<p role='status'>
						{view.status === 'connected'
							? view.room?.ready
								? t('lobbyReady')
								: peerConnected
									? t('opponentConnected')
									: t('waitingOpponent')
							: t('lobbyDisconnected')}
					</p>
					{view.room?.ready && <p>{t('opponentConnected')}</p>}
					<label>
						{t('inviteLink')}
						<input
							readOnly
							value={inviteUrl(window.location.href, credential.roomId)}
							aria-label={t('inviteLink')}
						/>
					</label>
					<button
						type='button'
						className={styles.primary}
						onClick={() => {
							void navigator.clipboard
								.writeText(inviteUrl(window.location.href, credential.roomId))
								.then(() => setCopied(true))
								.catch(() => setCopied(false));
						}}
					>
						{t(copied ? 'inviteCopied' : 'copyInvite')}
					</button>
					<button
						type='button'
						className={styles.primary}
						disabled={!view.room?.ready}
						onClick={() => client.current?.pingPeer()}
					>
						{t('testPeer')}
					</button>
					{view.peerMessage && (
						<p>
							{t('peerReceived')}: {view.peerMessage}
						</p>
					)}
					{view.status === 'disconnected' && (
						<button
							type='button'
							className={styles.primary}
							onClick={() => client.current?.reconnect()}
						>
							{t('reconnectLobby')}
						</button>
					)}
				</>
			)}
			{view.error && (
				<p role='alert'>
					{view.error === 'ROOM_FULL' ? t('roomFull') : `${t('lobbyError')} (${view.error})`}
				</p>
			)}
			<button
				type='button'
				className={styles.primary}
				onClick={() => {
					client.current?.disconnect();
					onLeave();
				}}
			>
				{t('leaveLobby')}
			</button>
		</div>
	);
}
