import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type CSSProperties, useState } from 'react';

import { WormsVectorText } from '../../../shared/ui/WormsVectorText';
import type { Worm } from '../model/worm';

const frameStyle: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	textAlign: 'center',
	padding: '2px 4px',
	minHeight: 20,
	background: '#08080c',
	border: '1px solid #a6a6b1',
	boxShadow: '0 0 0 1px #292933',
	borderRadius: 4,
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
			distanceFactor={1}
			center
			position={[0, 46, 0.2]}
			zIndexRange={[20, 0]}
			style={{ pointerEvents: 'none', display: health.alive ? 'block' : 'none' }}
		>
			<div
				data-worm-label={worm.id}
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					textAlign: 'center',
					gap: 1,
					whiteSpace: 'nowrap',
					userSelect: 'none',
					lineHeight: '14px',
					fontSize: 12,
					fontFamily: 'Arial, Helvetica, sans-serif',
					fontWeight: 700,
					color,
				}}
			>
				<div style={frameStyle}>
					<WormsVectorText text={worm.name} />
				</div>
				<div style={frameStyle}>
					<WormsVectorText text={String(health.hp)} height={10} />
				</div>
			</div>
		</Html>
	);
}
