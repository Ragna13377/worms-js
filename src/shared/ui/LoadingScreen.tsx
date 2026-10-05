import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import styles from './LoadingScreen.module.css';

export function LoadingScreen({ ready }: { ready: boolean }) {
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
				<p className={styles.note}>
					{errors.length ? 'Ресурсы не загрузились' : 'Подготавливаем землю…'}
				</p>
				{errors.length ? (
					<button type='button' onClick={() => window.location.reload()}>
						Повторить
					</button>
				) : (
					<div className={styles.track} aria-hidden='true'>
						<div
							className={styles.fill}
							style={{ width: `${ready ? 100 : Math.max(8, progress)}%` }}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
