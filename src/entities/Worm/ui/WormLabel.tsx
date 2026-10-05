import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type CSSProperties, useState } from 'react';
import { WormsText } from '../../../shared/ui/WormsText';
import type { Worm } from '../model/worm';

const frameStyle: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	padding: '0 2px',
	height: 16,
	background: '#08080c',
	border: '1px solid #a6a6b1',
	boxShadow: '0 0 0 1px #292933',
	borderRadius: 1,
};

/** Compact, separate name/HP frames; only HP/alive changes trigger React updates. */
export function WormLabel({ worm }: { worm: Worm }) {
	const [health, setHealth] = useState({ hp: worm.hp, alive: worm.alive });
	useFrame(() => {
		if (health.hp !== worm.hp || health.alive !== worm.alive)
			setHealth({ hp: worm.hp, alive: worm.alive });
	});
	const color = worm.team === 'RED' ? '#f58b84' : '#8fb8ff';
	return (
		<Html
			center
			position={[0, 41, 0.2]}
			zIndexRange={[20, 0]}
			style={{ pointerEvents: 'none', display: health.alive ? 'block' : 'none' }}
		>
			<div
				data-worm-label={worm.id}
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 1,
					whiteSpace: 'nowrap',
					userSelect: 'none',
					lineHeight: 0,
				}}
			>
				<div style={frameStyle}>
					<WormsText text={worm.name} size={15} color={color} />
				</div>
				<div style={frameStyle}>
					<WormsText text={String(health.hp)} size={15} color={color} />
				</div>
			</div>
		</Html>
	);
}
