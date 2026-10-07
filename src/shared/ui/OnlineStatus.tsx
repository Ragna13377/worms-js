import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/translations';
import gameUi from './GameUi.module.css';
import styles from './OnlineStatus.module.css';

export function onlineStatusCopy(code: string): [TranslationKey, TranslationKey] {
	if (code === 'connecting' || code === 'reconnecting') return [code, 'networkWait'];
	if (code === 'opponentDisconnected') return ['opponentDisconnected', 'waitingReconnection'];
	if (code === 'restoringMatch' || code === 'resynchronizing') return [code, 'networkWait'];
	if (code === 'ROOM_FULL' || code === 'MATCH_ALREADY_STARTED')
		return ['roomFullTitle', 'roomFull'];
	if (['ROOM_EXPIRED', 'ROOM_NOT_FOUND', 'MATCH_FINISHED', 'INVALID_TOKEN'].includes(code))
		return ['roomExpired', 'roomExpiredBody'];
	if (code === 'DESYNC') return ['fatalDesync', 'recoveryFailedBody'];
	if (code === 'OPPONENT_LEFT') return ['opponentLeft', 'matchEndedBody'];
	if (code === 'OPPONENT_DISCONNECTED') return ['opponentDisconnected', 'reconnectExpired'];
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
}: {
	code: string;
	progress?: number;
	onRetry?: () => void;
	onExit: () => void;
	busy?: boolean;
}) {
	const { t } = useI18n(),
		[title, body] = onlineStatusCopy(code);
	return (
		<div className={styles.backdrop}>
			<section className={styles.panel} role={busy ? 'status' : 'alert'} aria-live='polite'>
				<h2 className={styles.title}>{t(title)}</h2>
				<p>{t(body)}</p>
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
					{onRetry && (
						<button type='button' disabled={busy} onClick={onRetry}>
							{t('retry')}
						</button>
					)}
					<button type='button' onClick={onExit}>
						{t('exit')}
					</button>
				</div>
			</section>
		</div>
	);
}

export function NetworkPing({ ping, label = true }: { ping?: number; label?: boolean }) {
	const { t } = useI18n();
	return (
		<output
			className={`${gameUi.readout} ${styles.ping}`}
			aria-label={`${t('ping')}: ${ping ?? '…'}`}
			data-testid='network-ping'
			data-quality={
				ping === undefined ? 'unknown' : ping < 50 ? 'good' : ping <= 100 ? 'fair' : 'poor'
			}
		>
			{label && `${t('ping')}: `}
			<span className={styles.pingValue}>{ping ?? '…'}</span>
		</output>
	);
}
