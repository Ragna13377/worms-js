import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import type { TranslationKey } from '../../../shared/i18n/translations';
import { hasSavedGame, loadGame, type SavedGame } from '../../Gameplay/model/saveGame';
import aboutArt from '../assets/main-screen/about.webp';
import controlsArt from '../assets/main-screen/controls.webp';
import loadArt from '../assets/main-screen/load.webp';
import newGameArt from '../assets/main-screen/new_game.webp';
import { keepMenuPointerUnlocked } from '../model/releasePointerLock';
import styles from './MainMenu.module.css';

const menuArt = { newGame: newGameArt, load: loadArt, controls: controlsArt, about: aboutArt };
function CardArt({ kind }: { kind: keyof typeof menuArt }) {
	return (
		// biome-ignore lint/performance/noImgElement: Bundled menu artwork displayed without resizing requests.
		<img src={menuArt[kind].src} width={1448} height={1086} alt='' className={styles.art} />
	);
}

export function MainMenu({
	onStart,
	onLoad,
}: {
	onStart: (count: number) => Promise<void>;
	onLoad: (save: SavedGame) => void;
}) {
	const { t, language, setLanguage } = useI18n();
	const [screen, setScreen] = useState<'home' | 'setup' | 'controls' | 'about'>('home');
	const [count, setCount] = useState(3);
	const [saved, setSaved] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<TranslationKey>();
	const title = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		let live = true;
		hasSavedGame()
			.then((value) => {
				if (live) setSaved(value);
			})
			.catch(() => {
				if (live) setError('storageError');
			});
		return () => {
			live = false;
		};
	}, []);
	useEffect(() => keepMenuPointerUnlocked(document), []);
	useEffect(() => {
		title.current?.focus();
		const back = (event: KeyboardEvent) => {
			if (event.code === 'Escape') setScreen('home');
		};
		window.addEventListener('keydown', back);
		return () => window.removeEventListener('keydown', back);
	}, []);
	const navigate = (value: typeof screen) => {
		setScreen(value);
	};
	useEffect(() => {
		if (screen !== 'home') title.current?.focus();
	}, [screen]);
	const load = async () => {
		setBusy(true);
		setError(undefined);
		try {
			const value = await loadGame();
			if (!value) {
				setSaved(false);
				return;
			}
			onLoad(value);
		} catch {
			setError('loadError');
		} finally {
			setBusy(false);
		}
	};
	const start = async () => {
		if (busy) return;
		setBusy(true);
		setError(undefined);
		try {
			await onStart(count);
		} catch {
			setError('startError');
		} finally {
			setBusy(false);
		}
	};
	const keys: [string, TranslationKey][] = [
		['← →', 'move'],
		['↑ ↓', 'aim'],
		['Enter', 'jump'],
		['Backspace', 'highJump'],
		['Backspace × 2', 'backflip'],
		['Space', 'shoot'],
		['F1 / F2', 'weapons'],
		['Q', 'switchWeapon'],
		['1–5', 'fuse'],
		[t('rightMouse'), 'weaponMenu'],
		['Esc', 'pause'],
	];
	return (
		<section className={styles.screen} aria-label={t('gameMenu')}>
			<div className={styles.stars} aria-hidden='true'>
				{Array.from({ length: 22 }, (_, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: Fixed decorative star positions never reorder.
						key={`star-${i}`}
						style={{
							left: `${(i * 47 + 7) % 100}%`,
							top: `${(i * 31 + 9) % 100}%`,
							fontSize: i % 3 === 0 ? 19 : 10,
						}}
					>
						✦
					</span>
				))}
			</div>
			<div className={styles.shell}>
				<header className={styles.header}>
					<a
						className={styles.wordmark}
						href='https://github.com/Ragna13377/worms-js'
						target='_blank'
						rel='noreferrer'
					>
						WORMS<span>JS</span>
					</a>
					<fieldset className={styles.languages} aria-label={t('language')}>
						{(['ru', 'en'] as const).map((locale) => (
							<button
								type='button'
								key={locale}
								aria-pressed={language === locale}
								onClick={() => setLanguage(locale)}
							>
								{locale.toUpperCase()}
							</button>
						))}
					</fieldset>
				</header>
				{screen === 'home' ? (
					<div className={styles.homeContent}>
						<div className={styles.grid}>
							{(['newGame', 'load', 'controls', 'about'] as const).map((item) => (
								<button
									key={item}
									type='button'
									className={styles.card}
									disabled={item === 'load' && (!saved || busy)}
									onClick={() =>
										item === 'newGame'
											? navigate('setup')
											: item === 'load'
												? void load()
												: navigate(item)
									}
								>
									<CardArt kind={item} />
									<div className={styles.cardText}>
										<h2>{item === 'load' && busy ? t('loading') : t(item)}</h2>
									</div>
								</button>
							))}
						</div>
					</div>
				) : (
					<div
						className={`${styles.panel} ${styles.aboutPanel} ${screen === 'setup' ? styles.setupPanel : ''}`}
					>
						<div className={styles.panelHeader}>
							<button
								type='button'
								className={styles.backArrow}
								aria-label={t('back')}
								onClick={() => navigate('home')}
							>
								<svg viewBox='0 0 64 48' aria-hidden='true'>
									<path
										d='M28 5 5 24l23 19V32h29V16H28Z'
										fill='#9b6337'
										stroke='#261c37'
										strokeWidth='4'
										strokeLinejoin='round'
										transform='translate(0 2)'
									/>
									<path
										d='M28 3 5 22l23 19V30h29V14H28Z'
										fill='#ffd478'
										stroke='#261c37'
										strokeWidth='3'
										strokeLinejoin='round'
									/>
									<path
										d='m13 21 11-9M33 18h18'
										fill='none'
										stroke='#fff0b7'
										strokeWidth='3'
										strokeLinecap='round'
									/>
								</svg>
							</button>
							<h1 ref={title} tabIndex={-1}>
								{t(screen === 'setup' ? 'newGame' : screen)}
							</h1>
						</div>
						{screen === 'setup' ? (
							<>
								<div className={`${styles.setupBody} ${styles.scroller}`}>
									<fieldset className={styles.fieldset}>
										<legend>{t('mode')}</legend>
										<div className={styles.options}>
											{(['pvp', 'bot', 'lobby'] as const).map((mode) => (
												<label key={mode} className={styles.option} data-disabled={mode !== 'pvp'}>
													<input
														type='radio'
														name='mode'
														value={mode}
														checked={mode === 'pvp'}
														disabled={mode !== 'pvp'}
														readOnly
													/>
													<strong>{t(mode === 'lobby' ? 'lobby' : 'local')}</strong>
													<small>{t(`${mode}Hint`)}</small>
													{mode !== 'pvp' && <span className={styles.badge}>{t('soon')}</span>}
												</label>
											))}
										</div>
									</fieldset>
									<fieldset className={styles.fieldset}>
										<legend>{t('roster')}</legend>
										<div className={styles.options}>
											{([1, 2, 3] as const).map((value, i) => (
												<label key={value} className={styles.option}>
													<input
														type='radio'
														name='roster'
														value={value}
														checked={count === value}
														onChange={() => setCount(value)}
													/>
													<strong>{t((['duel', 'pairs', 'squads'] as const)[i])}</strong>
													<span className={styles.count}>
														{value}
														<em>vs</em>
														{value}
													</span>
												</label>
											))}
										</div>
									</fieldset>
								</div>
								<div className={styles.startRow}>
									<button
										type='button'
										className={styles.primary}
										disabled={busy}
										onClick={() => void start()}
									>
										{t(busy ? 'starting' : 'start')}
									</button>
								</div>
							</>
						) : screen === 'controls' ? (
							<dl className={`${styles.controls} ${styles.scroller}`}>
								{keys.map(([key, action]) => (
									<div key={action}>
										<dt>
											<kbd>{key}</kbd>
										</dt>
										<dd>{t(action)}</dd>
									</div>
								))}
							</dl>
						) : (
							<div className={styles.aboutBody}>
								<div className={styles.aboutCopy}>
									<p>
										<strong>Worms.js</strong>
										{t('aboutIntro')}
										<em>Worms Armageddon</em>
										{t('aboutIdea')}
									</p>
									<p>{t('aboutRespect')}</p>
									<p>
										{t('aboutFeedback')}{' '}
										<a
											className={styles.issueLink}
											href='https://github.com/Ragna13377/worms-js/issues'
											target='_blank'
											rel='noreferrer'
										>
											GitHub Issues
										</a>
										.
									</p>
								</div>
							</div>
						)}
					</div>
				)}
				{error && (
					<p className={styles.error} role='alert'>
						{t(error)}
					</p>
				)}
				<footer className={styles.footer}>
					<span>© WORMS JS</span>
					<span>
						<a href='https://github.com/Ragna13377' target='_blank' rel='noreferrer'>
							RAGNA13377
						</a>{' '}
						<span className={styles.dot}>✦</span> 2026
					</span>
				</footer>
			</div>
		</section>
	);
}
