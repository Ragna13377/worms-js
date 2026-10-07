import { useEffect, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { inviteUrl, type LobbyClient, type LobbyView } from '../../../shared/realtime/client';
import { NetworkPing, OnlineStatus } from '../../../shared/ui/OnlineStatus';
import { CopyInviteButton } from './CopyInviteButton';
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
	const [view, setView] = useState<LobbyView>(client.snapshot);
	const [starting, setStarting] = useState(false);
	useEffect(() => client.subscribe(setView), [client]);
	useEffect(() => {
		if (view.status === 'disconnected' || view.error) setStarting(false);
	}, [view.status, view.error]);
	useEffect(() => {
		// Defer until after the development setup/cleanup cycle; the client guards in-flight requests.
		const timer = setTimeout(() => {
			if (client.snapshot.status !== 'idle') return;
			if (roomId) void client.joinRoom(roomId);
			else void client.createRoom(count);
		}, 0);
		return () => clearTimeout(timer);
	}, [client, roomId, count]);
	const credential = view.credential;
	useEffect(() => {
		if (credential)
			window.history.replaceState(null, '', inviteUrl(window.location.href, credential.roomId));
	}, [credential]);
	const peerConnected =
		credential?.seat === 'HOST' ? view.room?.guestConnected : view.room?.hostConnected;
	const status =
		view.status === 'connecting' || view.status === 'idle'
			? 'connecting'
			: view.status === 'disconnected'
				? 'lobbyDisconnected'
				: starting || view.room?.matchStarted
					? 'preparingMatch'
					: peerConnected
						? credential?.seat === 'GUEST'
							? 'waitingHost'
							: 'opponentConnected'
						: 'waitingOpponent';
	return (
		<div className={`${styles.setupBody} ${styles.scroller} ${styles.lobbyBody}`}>
			<div className={styles.lobbyStatusRow}>
				<p className={styles.lobbyStatus} role='status'>
					<span className={styles.statusDot} aria-hidden='true' />
					{t(status)}
				</p>
				<NetworkPing ping={view.ping} className={styles.lobbyPing} />
			</div>
			<div className={styles.inviteArea}>
				{credential?.seat !== 'GUEST' && (
					<CopyInviteButton
						invite={credential ? inviteUrl(window.location.href, credential.roomId) : undefined}
					/>
				)}
				<p className={styles.inviteHint}>
					{t(credential?.seat === 'GUEST' ? 'joiningMatchHint' : 'shareInviteHint')}
				</p>
			</div>
			{credential?.seat === 'HOST' && (
				<div className={styles.startRow}>
					<button
						type='button'
						className={styles.primary}
						disabled={
							view.status !== 'connected' ||
							!view.room?.ready ||
							starting ||
							!!view.room?.matchStarted
						}
						onClick={() => {
							setStarting(true);
							client.send({ type: 'START' });
						}}
					>
						{t(starting ? 'preparingMatch' : 'startMatch')}
					</button>
				</div>
			)}
			{credential && (
				<output data-testid='room-code' hidden>
					{credential.roomId}
				</output>
			)}
			{view.error && (
				<OnlineStatus
					code={view.error}
					context='menu'
					onRetry={() =>
						credential
							? client.reconnect()
							: roomId
								? void client.joinRoom(roomId)
								: void client.createRoom(count)
					}
					busy={view.status === 'connecting'}
					onExit={onLeave}
				/>
			)}
		</div>
	);
}
