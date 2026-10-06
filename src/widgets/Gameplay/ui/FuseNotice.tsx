import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Game } from '../model/simulation';

export function FuseNotice({ game }: { game: Game }) {
	const ref = useRef<HTMLOutputElement>(null);
	useFrame(() => {
		const notice = game.fuseNotice,
			element = ref.current;
		if (!element) return;
		element.hidden =
			!notice || game.time >= notice.until || game.weapon.selectedWeapon !== 'grenade';
		if (notice) element.textContent = `Граната, ${notice.fuse} Сек, MIN Отскок`;
	});
	return (
		<Html
			fullscreen
			calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
			zIndexRange={[30, 30]}
			style={{ pointerEvents: 'none' }}
		>
			<output
				ref={ref}
				hidden
				data-testid='grenade-fuse-notice'
				style={{
					position: 'absolute',
					top: 8,
					left: '50%',
					transform: 'translateX(-50%)',
					whiteSpace: 'nowrap',
					color: '#fff',
					background: '#08080c',
					border: '1px solid #a6a6b1',
					boxShadow: '0 0 0 1px #292933',
					borderRadius: 4,
					padding: '2px 4px',
					font: 'bold 18px Arial, Helvetica, sans-serif',
				}}
			/>
		</Html>
	);
}
