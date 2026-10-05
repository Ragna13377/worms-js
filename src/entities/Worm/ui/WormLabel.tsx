import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useState } from 'react';
import { WormsText } from '../../../shared/ui/WormsText';
import type { Worm } from '../model/worm';

/** HP is the simulation value. React updates only when HP/alive changes. */
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
			position={[0, 40, 0.2]}
			zIndexRange={[20, 0]}
			style={{ pointerEvents: 'none', display: health.alive ? 'block' : 'none' }}
		>
			<div
				data-worm-label={worm.id}
				style={{
					textAlign: 'center',
					whiteSpace: 'nowrap',
					userSelect: 'none',
					fontSize: 13,
					lineHeight: '16px',
					fontWeight: 700,
					color,
					textShadow: '1px 1px 0 #171722,-1px -1px 0 #171722',
				}}
			>
				<div>{worm.name}</div>
				<div
					style={{
						display: 'inline-flex',
						padding: '0 4px',
						marginTop: 2,
						background: '#08080c',
						border: '1px solid #b7b7c8',
						boxShadow: '0 0 0 1px #303040',
						borderRadius: 2,
						color: '#fff',
						height: 24,
						alignItems: 'center',
					}}
				>
					<WormsText text={String(health.hp)} />
				</div>
			</div>
		</Html>
	);
}
