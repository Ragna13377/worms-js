import type { WeaponType } from '@entities/Weapon/model/weapon';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import bazooka from '@src/assets/props/Weapon Icons/bazooka.1.png';
import grenade from '@src/assets/props/Weapon Icons/grenade.1.png';
import { useEffect, useRef, useState } from 'react';
import type { GameplayControls } from '../model/controls';
import { cancelGameInput, type Game } from '../model/simulation';
import styles from './WeaponOverlay.module.css';

export type WeaponHud = {
	label: HTMLOutputElement | null;
	power: HTMLMeterElement | null;
	countdown: HTMLOutputElement | null;
};
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
	useEffect(() => {
		const canvas = gl.domElement;
		const open = (e: MouseEvent) => {
			e.preventDefault();
			controls.clear();
			cancelGameInput(game);
			canvas.dataset.weaponMenu = 'open';
			const b = canvas.getBoundingClientRect();
			setMenu({
				x: Math.max(0, Math.min(b.width - 200, e.clientX - b.left)),
				y: Math.max(0, Math.min(b.height - 126, e.clientY - b.top)),
			});
		};
		const close = () => {
			setMenu(null);
			delete canvas.dataset.weaponMenu;
			controls.clear();
			cancelGameInput(game);
		};
		const outside = (e: PointerEvent) => {
			if (canvas.dataset.weaponMenu && !menuRef.current?.contains(e.target as Node)) close();
		};
		const key = (e: KeyboardEvent) => {
			if (!canvas.dataset.weaponMenu) return;
			if (e.code === 'Escape') close();
			else if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.code)) return;
			e.preventDefault();
			e.stopImmediatePropagation();
		};
		canvas.addEventListener('contextmenu', open);
		window.addEventListener('pointerdown', outside, true);
		window.addEventListener('keydown', key, true);
		window.addEventListener('blur', close);
		const visibility = () => {
			if (document.hidden) close();
		};
		document.addEventListener('visibilitychange', visibility);
		return () => {
			canvas.removeEventListener('contextmenu', open);
			window.removeEventListener('pointerdown', outside, true);
			window.removeEventListener('keydown', key, true);
			window.removeEventListener('blur', close);
			document.removeEventListener('visibilitychange', visibility);
			delete canvas.dataset.weaponMenu;
		};
	}, [game, controls, gl]);
	const select = (weapon: WeaponType) => {
		game.pendingCommands.push(weapon);
		setMenu(null);
		delete gl.domElement.dataset.weaponMenu;
		controls.clear();
	};
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
					{(['bazooka', 'grenade'] as const).map((weapon) => (
						<button
							key={weapon}
							type='button'
							role='menuitemradio'
							aria-checked={game.weapon.selectedWeapon === weapon}
							onClick={() => select(weapon)}
						>
							{/* Imported local sprite icons work with the static export base path. */}
							{/* biome-ignore lint/performance/noImgElement: Original 32px pixel artwork. */}
							<img
								src={(weapon === 'bazooka' ? bazooka : grenade).src}
								width={32}
								height={32}
								alt=''
							/>
							<span>{weapon === 'bazooka' ? 'Bazooka' : 'Grenade'}</span>
							<b>{game.weapon.selectedWeapon === weapon ? '◆' : ''}</b>
						</button>
					))}
				</div>
			)}
		</Html>
	);
}
