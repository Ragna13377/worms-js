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
				<div className={styles.emblem} aria-hidden='true'>
					<div className={styles.orbit} />
					<svg width='74' height='74' viewBox='0 0 74 74'>
						<title>Червь готовится к игре</title>
						<path
							d='M23 55c-8-5-7-13-3-20 3-5 2-9 1-13-2-10 4-16 12-16 10 0 16 7 15 17-1 8-7 15-4 20 3 4 10 3 11 8 2 7-12 10-22 8z'
							fill='#f4b9b1'
							stroke='#5d3849'
							strokeWidth='3'
						/>
						<ellipse cx='33' cy='21' rx='5' ry='7' fill='#fff7e5' />
						<ellipse cx='43' cy='21' rx='5' ry='7' fill='#fff7e5' />
						<circle cx='35' cy='23' r='2' fill='#35354f' />
						<circle cx='45' cy='23' r='2' fill='#35354f' />
						<path
							d='M32 34q6 4 10 0'
							fill='none'
							stroke='#874c5b'
							strokeWidth='2'
							strokeLinecap='round'
						/>
					</svg>
				</div>
				<h1>{errors.length ? 'Ресурсы не загрузились' : 'Готовим поле боя'}</h1>
				<p>
					{errors.length
						? 'Попробуй загрузить игру ещё раз.'
						: 'Черви занимают позиции. Земля пока цела.'}
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
				{!errors.length && (
					<span className={styles.note}>
						{active && progress > 0
							? `Загрузка ресурсов · ${Math.round(progress)}%`
							: 'Подготавливаем остров…'}
					</span>
				)}
			</div>
		</div>
	);
}
