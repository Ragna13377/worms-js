import { useProgress } from '@react-three/drei';
import { useI18n } from '@shared/i18n';
import { useEffect, useState } from 'react';
import styles from './LoadingScreen.module.css';

export function LoadingScreen({ ready }: { ready: boolean }) {
	const { t } = useI18n();
	const { active, progress, errors } = useProgress();
	const [minimumElapsed, setMinimumElapsed] = useState(false);
	useEffect(() => {
		const timeout = window.setTimeout(() => setMinimumElapsed(true), 450);
		return () => window.clearTimeout(timeout);
	}, []);
	if (ready && !active && minimumElapsed && errors.length === 0) return null;
	return (
		<div className={styles.screen} role='status' aria-live='polite' data-testid='loading-screen'>
			<div className={styles.card}>
				<h1 className={styles.title}>{errors.length ? t('resourcesError') : t('preparing')}</h1>
				{errors.length ? (
					<button type='button' onClick={() => window.location.reload()}>
						{t('retry')}
					</button>
				) : (
					<div className={styles.track} aria-hidden='true'>
						<div
							className={styles.fill}
							style={{ width: `${ready ? 100 : Math.max(8, progress)}%` }}
						/>
					</div>
				)}
				{!errors.length && (
					<p className={styles.note}>
						{active && progress > 0
							? `${t('resourcesLoading')} · ${Math.round(progress)}%`
							: t('preparingIsland')}
					</p>
				)}
			</div>
		</div>
	);
}
