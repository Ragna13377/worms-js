import type { WeaponType } from '@entities/Weapon/model/weapon';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import cursorArt from '@src/assets/props/Misc/cursorr.png';
import bazooka from '@src/assets/props/Weapon Icons/bazooka.1.png';
import grenade from '@src/assets/props/Weapon Icons/grenade.1.png';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameplayControls } from '../model/controls';
import { cancelGameInput, type Game } from '../model/simulation';
import { canOpenWeaponMenu } from '../model/turns';
import styles from './WeaponOverlay.module.css';

const CELL = 28,
	WIDTH = 60,
	HEIGHT = 74;
export function WeaponOverlay({ game, controls }: { game: Game; controls: GameplayControls }) {
	const { gl } = useThree();
	const [open, setOpen] = useState(false);
	const [hover, setHover] = useState<WeaponType>('bazooka');
	const menuRef = useRef<HTMLDivElement>(null),
		cursorRef = useRef<HTMLCanvasElement>(null);
	const cursor = useRef({ x: 8, y: 8 });
	const close = useCallback(() => {
		setOpen(false);
		delete gl.domElement.dataset.weaponMenu;
		if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
		controls.clear();
		cancelGameInput(game);
	}, [gl, controls, game]);
	const select = useCallback(
		(weapon: WeaponType) => {
			if (!canOpenWeaponMenu(game)) {
				close();
				return;
			}
			close();
			game.pendingCommands.push(weapon);
		},
		[close, game]
	);
	useEffect(() => {
		const canvas = gl.domElement;
		const paint = () => {
			const c = cursor.current;
			if (cursorRef.current)
				cursorRef.current.style.transform = `translate(${c.x - 20}px,${c.y - 20}px)`;
			if (c.y < CELL * 2) setHover(c.y < CELL ? 'bazooka' : 'grenade');
		};
		const toggle = (e: MouseEvent) => {
			if (e.button !== 2) return;
			if (!canOpenWeaponMenu(game)) {
				if (e.target === canvas) e.preventDefault();
				return;
			}
			if (canvas.dataset.weaponMenu) {
				e.preventDefault();
				close();
				return;
			}
			if (e.target !== canvas) return;
			e.preventDefault();
			controls.clear();
			cancelGameInput(game);
			cursor.current = { x: 8, y: 8 };
			paint();
			canvas.dataset.weaponMenu = 'open';
			setOpen(true);
			delete canvas.dataset.pointerLockError;
			canvas.requestPointerLock()?.catch((error: Error) => {
				canvas.dataset.pointerLockError = error.message;
			});
		};
		const move = (e: MouseEvent) => {
			if (!canvas.dataset.weaponMenu || !menuRef.current) return;
			const b = menuRef.current.getBoundingClientRect(),
				c = cursor.current;
			const locked = document.pointerLockElement === canvas;
			c.x = Math.max(0, Math.min(WIDTH - 5, locked ? c.x + e.movementX : e.clientX - b.left - 2));
			c.y = Math.max(0, Math.min(HEIGHT - 5, locked ? c.y + e.movementY : e.clientY - b.top - 2));
			paint();
		};
		const choose = (e: PointerEvent) => {
			if (!canvas.dataset.weaponMenu || e.button !== 0) return;
			if (document.pointerLockElement !== canvas && menuRef.current?.contains(e.target as Node))
				return;
			e.preventDefault();
			e.stopImmediatePropagation();
			if (cursor.current.y < CELL * 2) select(cursor.current.y < CELL ? 'bazooka' : 'grenade');
		};
		const key = (e: KeyboardEvent) => {
			if (!canvas.dataset.weaponMenu) return;
			if (e.code === 'Escape') close();
			else if (e.code === 'F1') select('bazooka');
			else if (e.code === 'F2') select('grenade');
			else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
				cursor.current.y = e.code === 'ArrowDown' ? 42 : 14;
				paint();
			} else if (e.code === 'Enter' && cursor.current.y < CELL * 2)
				select(cursor.current.y < CELL ? 'bazooka' : 'grenade');
			e.preventDefault();
			e.stopImmediatePropagation();
		};
		const lockChanged = () => {
			if (!document.pointerLockElement && canvas.dataset.weaponMenu) close();
		};
		const visibility = () => {
			if (document.hidden) close();
		};
		const suppressContext = (e: MouseEvent) => {
			if (e.target === canvas || menuRef.current?.contains(e.target as Node)) e.preventDefault();
		};
		window.addEventListener('mousedown', toggle, true);
		window.addEventListener('contextmenu', suppressContext);
		window.addEventListener('mousemove', move);
		window.addEventListener('pointerdown', choose, true);
		window.addEventListener('keydown', key, true);
		window.addEventListener('blur', close);
		document.addEventListener('pointerlockchange', lockChanged);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			window.removeEventListener('mousedown', toggle, true);
			window.removeEventListener('contextmenu', suppressContext);
			window.removeEventListener('mousemove', move);
			window.removeEventListener('pointerdown', choose, true);
			window.removeEventListener('keydown', key, true);
			window.removeEventListener('blur', close);
			document.removeEventListener('pointerlockchange', lockChanged);
			document.removeEventListener('visibilitychange', visibility);
			if (document.pointerLockElement === canvas) document.exitPointerLock();
			delete canvas.dataset.weaponMenu;
		};
	}, [gl, game, controls, close, select]);
	useFrame(() => {
		if (gl.domElement.dataset.weaponMenu && !canOpenWeaponMenu(game)) close();
	});
	const cursorImage = useRef<HTMLImageElement | null>(null);
	const attachCursor = useCallback((canvas: HTMLCanvasElement | null) => {
		cursorRef.current = canvas;
		const image = cursorImage.current;
		const ctx = canvas?.getContext('2d');
		if (!ctx || !image) return;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(image, 0, 20 * 60, 60, 60, 0, 0, 60, 60);
		const pixels = ctx.getImageData(0, 0, 60, 60);
		for (let i = 0; i < pixels.data.length; i += 4)
			if (pixels.data[i] === 128 && pixels.data[i + 1] === 128 && pixels.data[i + 2] === 192)
				pixels.data[i + 3] = 0;
		ctx.putImageData(pixels, 0, 0);
	}, []);
	useEffect(() => {
		const image = new Image();
		image.onload = () => {
			cursorImage.current = image;
			attachCursor(cursorRef.current);
		};
		image.src = cursorArt.src;
		return () => {
			image.onload = null;
		};
	}, [attachCursor]);
	return (
		<Html
			fullscreen
			calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
			zIndexRange={[30, 30]}
			style={{ pointerEvents: 'none' }}
		>
			<div
				ref={menuRef}
				className={styles.menu}
				data-open={open}
				role='menu'
				aria-label='Weapons'
				aria-hidden={!open}
				inert={!open}
			>
				{(['bazooka', 'grenade'] as const).map((weapon, i) => (
					<div className={styles.row} key={weapon} data-hovered={hover === weapon}>
						<button
							type='button'
							role='menuitemradio'
							aria-checked={game.weapon.selectedWeapon === weapon}
							aria-label={`F${i + 1} — ${weapon}`}
							onClick={() => select(weapon)}
						>
							F{i + 1}
						</button>
						<button
							type='button'
							role='menuitemradio'
							aria-checked={game.weapon.selectedWeapon === weapon}
							aria-label={weapon}
							onClick={() => select(weapon)}
						>
							{/* biome-ignore lint/performance/noImgElement: Original pixel artwork. */}
							<img
								src={(weapon === 'bazooka' ? bazooka : grenade).src}
								width={28}
								height={28}
								alt=''
							/>
						</button>
					</div>
				))}
				<output className={styles.name} aria-label='Hovered weapon'>
					{hover === 'bazooka' ? 'Bazooka' : hover === 'grenade' ? 'Grenade' : ''}
				</output>
				<canvas
					ref={attachCursor}
					className={styles.cursor}
					width={60}
					height={60}
					style={{ transform: 'translate(-12px,-12px)' }}
					tabIndex={-1}
					aria-label='Weapon menu cursor'
				/>
			</div>
		</Html>
	);
}
