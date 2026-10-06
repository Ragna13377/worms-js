import type { WeaponType } from '@entities/Weapon/model/weapon';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import cursorArt from '@src/assets/props/Misc/cursorr.png';
import bazooka from '@src/assets/props/Weapon Icons/bazooka.1.png';
import grenade from '@src/assets/props/Weapon Icons/grenade.1.png';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameplayControls } from '../model/controls';
import { cancelGameInput, type Game } from '../model/simulation';
import styles from './WeaponOverlay.module.css';
export type WeaponHud = {
	label: HTMLOutputElement | null;
	power: HTMLMeterElement | null;
	countdown: HTMLOutputElement | null;
};
const MENU_SIZE = 66;
export function WeaponOverlay({
	game,
	controls,
	hud,
}: {
	game: Game;
	controls: GameplayControls;
	hud: WeaponHud;
}) {
	const { gl } = useThree();
	const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const cursorRef = useRef<HTMLCanvasElement>(null);
	const cursor = useRef({ x: 8, y: 8 });
	const close = useCallback(() => {
		setMenu(null);
		delete gl.domElement.dataset.weaponMenu;
		if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
		controls.clear();
		cancelGameInput(game);
	}, [gl, controls, game]);
	const select = useCallback(
		(weapon: WeaponType) => {
			close();
			game.pendingCommands.push(weapon);
		},
		[close, game]
	);
	useEffect(() => {
		const canvas = gl.domElement;
		const open = (e: MouseEvent) => {
			if (e.button !== 2) return;
			e.preventDefault();
			controls.clear();
			cancelGameInput(game);
			const b = canvas.getBoundingClientRect();
			cursor.current = { x: 8, y: 8 };
			canvas.dataset.weaponMenu = 'open';
			setMenu({
				x: Math.max(0, Math.min(b.width - MENU_SIZE, e.clientX - b.left)),
				y: Math.max(0, Math.min(b.height - MENU_SIZE, e.clientY - b.top)),
			});
			// A real pointer lock keeps the browser pointer inside this virtual grid.
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
			c.x = Math.max(1, Math.min(MENU_SIZE - 3, locked ? c.x + e.movementX : e.clientX - b.left));
			c.y = Math.max(1, Math.min(MENU_SIZE - 3, locked ? c.y + e.movementY : e.clientY - b.top));
			if (cursorRef.current)
				cursorRef.current.style.transform = `translate(${c.x - 13}px,${c.y - 13}px)`;
		};
		const choose = (e: PointerEvent) => {
			if (!canvas.dataset.weaponMenu || e.button !== 0) return;
			if (document.pointerLockElement !== canvas && menuRef.current?.contains(e.target as Node))
				return;
			e.preventDefault();
			e.stopImmediatePropagation();
			select(cursor.current.y < 33 ? 'bazooka' : 'grenade');
		};
		const key = (e: KeyboardEvent) => {
			if (!canvas.dataset.weaponMenu) return;
			if (e.code === 'Escape') close();
			else if (e.code === 'F1') select('bazooka');
			else if (e.code === 'F2') select('grenade');
			else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
				cursor.current.y = e.code === 'ArrowDown' ? 48 : 16;
				if (cursorRef.current)
					cursorRef.current.style.transform = `translate(${cursor.current.x - 13}px,${cursor.current.y - 13}px)`;
			} else if (e.code === 'Enter') select(cursor.current.y < 33 ? 'bazooka' : 'grenade');
			e.preventDefault();
			e.stopImmediatePropagation();
		};
		const lockChanged = () => {
			if (!document.pointerLockElement && canvas.dataset.weaponMenu) close();
		};
		const visibility = () => {
			if (document.hidden) close();
		};
		const suppressContext = (e: MouseEvent) => e.preventDefault();
		canvas.addEventListener('mousedown', open);
		canvas.addEventListener('contextmenu', suppressContext);
		window.addEventListener('mousemove', move);
		window.addEventListener('pointerdown', choose, true);
		window.addEventListener('keydown', key, true);
		window.addEventListener('blur', close);
		document.addEventListener('pointerlockchange', lockChanged);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			canvas.removeEventListener('mousedown', open);
			canvas.removeEventListener('contextmenu', suppressContext);
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
	useEffect(() => {
		if (!menu) return;
		const image = new Image();
		image.src = cursorArt.src;
		image.onload = () => {
			const ctx = cursorRef.current?.getContext('2d');
			if (!ctx) return;
			ctx.drawImage(image, 0, 20 * 60, 60, 60, 0, 0, 30, 30);
			const pixels = ctx.getImageData(0, 0, 30, 30);
			for (let i = 0; i < pixels.data.length; i += 4)
				if (pixels.data[i] === 128 && pixels.data[i + 1] === 128 && pixels.data[i + 2] === 192)
					pixels.data[i + 3] = 0;
			ctx.putImageData(pixels, 0, 0);
		};
		return () => {
			image.onload = null;
		};
	}, [menu]);
	return (
		<Html
			fullscreen
			calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
			zIndexRange={[30, 30]}
			style={{ pointerEvents: 'none' }}
		>
			<div className={styles.hud}>
				<output
					ref={(node) => {
						hud.label = node;
					}}
					aria-label='Selected weapon'
				/>
				<div className={styles.power}>
					<span>Мощность</span>
					<meter
						ref={(node) => {
							hud.power = node;
						}}
						min={0}
						max={1}
						value={0}
						aria-label='Shot power'
					/>
				</div>
				<output
					ref={(node) => {
						hud.countdown = node;
					}}
					aria-label='Grenade countdown'
				/>
				<small>ПКМ — оружие · ↑↓ — прицел · Пробел — заряд / выстрел · 1–5 — таймер</small>
			</div>

			{menu && (
				<div
					ref={menuRef}
					className={styles.menu}
					style={{ left: menu.x, top: menu.y }}
					role='menu'
					aria-label='Weapons'
				>
					{(['bazooka', 'grenade'] as const).map((weapon, i) => (
						<div className={styles.row} key={weapon}>
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
									width={32}
									height={32}
									alt=''
								/>
							</button>
						</div>
					))}
					<canvas
						ref={cursorRef}
						className={styles.cursor}
						width={30}
						height={30}
						style={{ transform: 'translate(-5px,-5px)' }}
						tabIndex={-1}
						aria-label='Weapon menu cursor'
					/>
				</div>
			)}
		</Html>
	);
}
