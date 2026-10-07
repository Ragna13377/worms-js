import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/translations';
import gameUi from './GameUi.module.css';
import menuUi from './MenuUi.module.css';
import styles from './OnlineStatus.module.css';

export function onlineStatusCopy(code: string): [TranslationKey, TranslationKey] {
	if (code === 'connecting') return [code, 'connectingBody'];
	if (code === 'reconnecting') return [code, 'reconnectingBody'];
	if (code === 'opponentDisconnected') return ['opponentDisconnected', 'waitingReconnection'];
	if (code === 'restoringMatch' || code === 'resynchronizing')
		return ['restoringMatch', 'restoringBody'];
	if (code === 'ROOM_FULL' || code === 'MATCH_ALREADY_STARTED')
		return ['roomFullTitle', 'roomFull'];
	if (['ROOM_EXPIRED', 'ROOM_NOT_FOUND', 'MATCH_FINISHED', 'INVALID_TOKEN'].includes(code))
		return ['roomExpired', 'roomExpiredBody'];
	if (code === 'DESYNC') return ['fatalDesync', 'recoveryFailedBody'];
	if (code === 'OPPONENT_LEFT') return ['opponentLeft', 'matchEndedBody'];
	if (code === 'OPPONENT_DISCONNECTED') return ['opponentMissing', 'reconnectExpired'];
	if (
		[
			'RECOVERY_FAILED',
			'PREPARE_FAILED',
			'INPUT_RATE_LIMIT',
			'SIMULATION_BEHIND',
			'LATE_INPUT',
			'BAD_SEQUENCE',
			'PEER_TIMEOUT',
		].includes(code)
	)
		return ['recoveryFailed', 'recoveryFailedBody'];
	return [code === 'SERVER_LIMIT' ? 'serverLimit' : 'serverUnavailable', 'serverUnavailableBody'];
}

export function OnlineStatus({
	code,
	progress,
	onRetry,
	onExit,
	busy = false,
	context = 'game',
	deadline,
}: {
	code: string;
	progress?: number;
	onRetry?: () => void;
	onExit: () => void;
	busy?: boolean;
	context?: 'game' | 'menu';
	deadline?: number;
}) {
	const { t } = useI18n(),
		[title, body] = onlineStatusCopy(code);
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (code !== 'opponentDisconnected' || deadline === undefined) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 200);
		return () => clearInterval(timer);
	}, [code, deadline]);
	const seconds =
		deadline === undefined ? undefined : Math.max(0, Math.ceil((deadline - now) / 1000));
	return (
		<div className={`${styles.backdrop} ${context === 'menu' ? styles.menu : ''}`}>
			<section
				className={context === 'menu' ? styles.menuPanel : styles.panel}
				role={busy ? 'status' : 'alert'}
				aria-live='polite'
			>
				<h2 className={context === 'menu' ? styles.menuTitle : styles.title}>{t(title)}</h2>
				<p>{t(body)}</p>
				{code === 'opponentDisconnected' && seconds !== undefined && (
					<output
						className={gameUi.readout}
						data-testid='reconnect-countdown'
						aria-label={t('waitingReconnection')}
					>
						{`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}
					</output>
				)}
				{progress !== undefined && (
					<>
						<div
							className={styles.progress}
							role='progressbar'
							aria-label={t(title)}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={progress}
						>
							<div style={{ width: `${progress}%` }} />
						</div>
						<output className={gameUi.readout}>{progress}%</output>
					</>
				)}
				<div className={styles.actions}>
					{onRetry && (title === 'serverUnavailable' || title === 'serverLimit') && (
						<button
							className={context === 'menu' ? menuUi.button : undefined}
							type='button'
							disabled={busy}
							onClick={onRetry}
						>
							{t('retry')}
						</button>
					)}
					<button
						className={context === 'menu' ? menuUi.button : undefined}
						type='button'
						onClick={onExit}
					>
						{t('mainMenu')}
					</button>
				</div>
			</section>
		</div>
	);
}

export function NetworkPing({
	ping,
	framed = false,
	className = '',
}: {
	ping?: number;
	framed?: boolean;
	className?: string;
}) {
	const { t } = useI18n();
	return (
		<output
			className={`${framed ? gameUi.readout : ''} ${styles.ping} ${className}`}
			aria-label={`${t('ping')}: ${ping ?? '…'}`}
			data-testid='network-ping'
			data-quality={
				ping === undefined ? 'unknown' : ping < 50 ? 'good' : ping <= 100 ? 'fair' : 'poor'
			}
		>
			{`${t('ping')}: `}
			<span
				className={
					ping === undefined
						? undefined
						: ping < 50
							? styles.good
							: ping <= 100
								? styles.fair
								: styles.poor
				}
			>
				{ping ?? '…'}
			</span>
		</output>
	);
}
