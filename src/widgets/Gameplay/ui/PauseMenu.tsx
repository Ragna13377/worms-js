import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameWorld } from '../../../entities/World/model/world';
import { useI18n } from '../../../shared/i18n';
import type { GameplayControls } from '../model/controls';
import { type GameMode, saveGame } from '../model/saveGame';
import { cancelGameInput, type Game } from '../model/simulation';
import { MenuCursor } from './MenuCursor';
import styles from './PauseMenu.module.css';

export function PauseMenu({
	game,
	controls,
	onExit,
	world,
	mode,
	active,
}: {
	game: Game;
	controls: GameplayControls;
	onExit: () => void;
	world: GameWorld;
	mode: GameMode;
	active: boolean;
}) {
	const { t } = useI18n();
	const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'saveError'>('idle');
	const save = async () => {
		setSaveStatus('saving');
		try {
			await saveGame(game, world, mode);
			setSaveStatus('saved');
		} catch {
			setSaveStatus('saveError');
		}
	};
	const { gl } = useThree();
	const [open, setOpen] = useState(false),
		[confirm, setConfirm] = useState(false);
	const [choice, setChoice] = useState<'yes' | 'no'>('no');
	const [cursor, setCursor] = useState({ x: 170, y: 60 });
	const [hover, setHover] = useState('exit');
	const group = useRef<HTMLDivElement>(null),
		menu = useRef<HTMLDivElement>(null),
		confirmation = useRef<HTMLDivElement>(null);
	const position = useRef({ x: 170, y: 60 }),
		confirming = useRef(false);
	const exitButton = useRef<HTMLButtonElement>(null),
		noButton = useRef<HTMLButtonElement>(null);
	const showConfirmation = useCallback((value: boolean) => {
		confirming.current = value;
		setConfirm(value);
		if (!value && menu.current) {
			position.current.y = Math.min(
				position.current.y,
				menu.current.getBoundingClientRect().height - 3
			);
			setCursor({ ...position.current });
		}
	}, []);
	const close = useCallback(() => {
		game.paused = false;
		controls.clear();
		cancelGameInput(game);
		setOpen(false);
		showConfirmation(false);
		if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
	}, [game, controls, gl, showConfirmation]);
	useEffect(() => {
		if (!active) return;
		const canvas = gl.domElement;
		const key = (e: KeyboardEvent) => {
			if (game.match.turnState === 'MATCH_END') return;
			if (e.code !== 'Escape' || e.repeat) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			if (game.paused) {
				if (confirming.current) {
					showConfirmation(false);
					exitButton.current?.focus();
				} else close();
				return;
			}
			game.paused = true;
			controls.clear();
			cancelGameInput(game);
			position.current = { x: 170, y: 60 };
			setCursor({ ...position.current });
			setOpen(true);
			setSaveStatus('idle');
			showConfirmation(false);
			canvas.requestPointerLock()?.catch(() => {});
		};
		const move = (e: MouseEvent) => {
			if (!game.paused || !group.current || !menu.current) return;
			const bounds = group.current.getBoundingClientRect(),
				main = menu.current.getBoundingClientRect();
			const bottom =
				confirming.current && confirmation.current
					? confirmation.current.getBoundingClientRect().bottom
					: main.bottom;
			const p = position.current;
			const locked = document.pointerLockElement === canvas;
			p.x = Math.max(
				2,
				Math.min(main.width - 3, locked ? p.x + e.movementX : e.clientX - bounds.left)
			);
			p.y = Math.max(
				2,
				Math.min(bottom - bounds.top - 3, locked ? p.y + e.movementY : e.clientY - bounds.top)
			);
			setCursor({ ...p });
			const button = document
				.elementFromPoint(bounds.left + p.x, bounds.top + p.y)
				?.closest<HTMLButtonElement>('button');
			setHover(button?.dataset.action ?? '');
			if (button) button.focus({ preventScroll: true });
			if (button?.dataset.choice) setChoice(button.dataset.choice as 'yes' | 'no');
		};
		const click = (e: MouseEvent) => {
			if (!game.paused || !group.current || !e.isTrusted || e.detail === 0) return;
			// When unlocked, ordinary DOM clicks already hit the correct menu button.
			if (document.pointerLockElement !== canvas) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			const b = group.current.getBoundingClientRect(),
				p = position.current;
			const button = document
				.elementFromPoint(b.left + p.x, b.top + p.y)
				?.closest<HTMLButtonElement>('button');
			if (button && group.current.contains(button)) button.click();
		};
		window.addEventListener('keydown', key, true);
		window.addEventListener('mousemove', move);
		window.addEventListener('click', click, true);
		return () => {
			window.removeEventListener('keydown', key, true);
			window.removeEventListener('mousemove', move);
			window.removeEventListener('click', click, true);
		};
	}, [game, controls, gl, close, showConfirmation, active]);
	useEffect(
		() => () => {
			game.paused = false;
			if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
		},
		[game, gl]
	);
	useEffect(() => {
		if (open) exitButton.current?.focus();
	}, [open]);
	useEffect(() => {
		if (confirm) noButton.current?.focus();
	}, [confirm]);
	const cancel = () => {
		showConfirmation(false);
		exitButton.current?.focus();
	};
	return (
		<Html
			fullscreen
			calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
			zIndexRange={[40, 40]}
			style={{ pointerEvents: 'none' }}
		>
			{open && active && (
				<div className={styles.overlay} data-pause-menu='true'>
					<div
						ref={group}
						className={styles.group}
						role='dialog'
						aria-modal='true'
						aria-label={t('gameMenu')}
						onContextMenu={(e) => e.preventDefault()}
						onKeyDown={(e) => {
							if (e.code !== 'Tab') return;
							const buttons = Array.from(
								e.currentTarget.querySelectorAll<HTMLButtonElement>(
									confirm ? '[data-choice]' : '[data-pause-action]:not(:disabled)'
								)
							);
							const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
							e.preventDefault();
							buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
						}}
					>
						<div ref={menu} className={styles.menu}>
							<div className={styles.title}>
								{t(mode === 'lobby' ? 'lobby' : 'local')} · {t(mode)}
							</div>
							<div className={styles.actions}>
								<button
									type='button'
									data-pause-action
									data-action='resume'
									data-hovered={hover === 'resume'}
									onClick={close}
								>
									{t('resume')}
								</button>
								<button
									type='button'
									data-pause-action
									data-action='save'
									data-hovered={hover === 'save'}
									disabled={mode === 'lobby' || saveStatus === 'saving'}
									onClick={() => void save()}
								>
									{t(saveStatus === 'saving' ? 'saving' : 'save')}
								</button>
								{saveStatus !== 'idle' && saveStatus !== 'saving' && (
									<output className={styles.saveStatus} aria-live='polite'>
										{t(saveStatus)}
									</output>
								)}
								<button
									ref={exitButton}
									type='button'
									data-pause-action
									data-action='exit'
									data-selected={confirm}
									data-hovered={hover === 'exit'}
									onClick={() => {
										setChoice('no');
										showConfirmation(true);
									}}
								>
									{t('exit')}
								</button>
							</div>
						</div>
						<div
							ref={confirmation}
							className={styles.confirm}
							data-open={confirm}
							inert={!confirm}
							aria-hidden={!confirm}
							role='alertdialog'
							aria-label={t('confirm')}
						>
							<div className={styles.question}>
								{t('confirm')}
								<br />
								<small>{t('exitHint')}</small>
							</div>
							<fieldset
								className={styles.choices}
								aria-label={t('confirmExit')}
								onKeyDown={(e) => {
									if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
										e.preventDefault();
										const next = choice === 'yes' ? 'no' : 'yes';
										setChoice(next);
										e.currentTarget
											.querySelector<HTMLButtonElement>(`[data-choice="${next}"]`)
											?.focus();
									}
								}}
							>
								<button
									type='button'
									data-choice='yes'
									data-selected={choice === 'yes'}
									onFocus={() => setChoice('yes')}
									onClick={() => {
										close();
										if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
										onExit();
									}}
								>
									{t('yes')}
								</button>
								<button
									ref={noButton}
									type='button'
									data-choice='no'
									data-selected={choice === 'no'}
									onFocus={() => setChoice('no')}
									onClick={cancel}
								>
									{t('no')}
								</button>
							</fieldset>
						</div>
						<MenuCursor x={cursor.x} y={cursor.y} />
					</div>
				</div>
			)}
		</Html>
	);
}
