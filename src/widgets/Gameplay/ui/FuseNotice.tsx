import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useI18n } from '@shared/i18n';
import { useRef } from 'react';
import type { Game } from '../model/simulation';

export function FuseNotice({ game }: { game: Game }) {
	const { t } = useI18n();
	const ref = useRef<HTMLOutputElement>(null);
	useFrame(() => {
		const notice = game.fuseNotice,
			element = ref.current;
		if (!element) return;
		element.hidden =
			!notice || game.time >= notice.until || game.weapon.selectedWeapon !== 'grenade';
		if (notice)
			element.textContent = `${t('grenade')}, ${notice.fuse} ${t('seconds')}, ${t('minBounce')}`;
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
					padding: '1px 2px',
					font: 'bold 13.5px Arial, Helvetica, sans-serif',
				}}
			/>
		</Html>
	);
}
