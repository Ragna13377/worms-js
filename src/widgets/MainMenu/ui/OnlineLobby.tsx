import { useEffect, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { inviteUrl, type LobbyClient, type LobbyView } from '../../../shared/realtime/client';
import styles from './MainMenu.module.css';

export function OnlineLobby({
	roomId,
	onLeave,
	client,
	count,
}: {
	roomId?: string;
	onLeave: () => void;
	client: LobbyClient;
	count: number;
}) {
	const { t } = useI18n();
	const [view, setView] = useState<LobbyView>({ status: 'idle' });
	const [code, setCode] = useState(roomId ?? '');
	const [copied, setCopied] = useState(false);
	useEffect(() => client.subscribe(setView), [client]);
	const credential = view.credential;
	useEffect(() => {
		if (credential)
			window.history.replaceState(null, '', inviteUrl(window.location.href, credential.roomId));
	}, [credential]);
	const peerConnected =
		credential?.seat === 'HOST' ? view.room?.guestConnected : view.room?.hostConnected;
	return (
		<div className={`${styles.setupBody} ${styles.scroller} ${styles.lobbyBody}`}>
			<p>
				{view.room?.roster ?? count}v{view.room?.roster ?? count}
			</p>
			{!credential ? (
				<>
					{!roomId && (
						<button
							type='button'
							className={styles.primary}
							disabled={view.status === 'connecting'}
							onClick={() => void client.createRoom(count)}
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
						onClick={() => void client.joinRoom(code)}
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
					{credential.seat === 'HOST' && view.room?.ready && !view.room.matchStarted && (
						<button
							type='button'
							className={styles.primary}
							onClick={() => client.send({ type: 'START' })}
						>
							{t('startMatch')}
						</button>
					)}
					{view.room?.matchStarted ? (
						<p>{t('preparingMatch')}</p>
					) : (
						credential.seat === 'GUEST' && <p>{t('waitingHost')}</p>
					)}
					{view.status === 'disconnected' && (
						<button type='button' className={styles.primary} onClick={() => client.reconnect()}>
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
					client.leave();
					onLeave();
				}}
			>
				{t('leaveLobby')}
			</button>
		</div>
	);
}
