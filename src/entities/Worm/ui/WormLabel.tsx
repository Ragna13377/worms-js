import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type CSSProperties, useRef, useState } from 'react';
import { WormsVectorText } from '../../../shared/ui/WormsVectorText';
import { TEAM_COLORS } from '../../Match/model/colors';
import {
	advanceHealthFeedback,
	createHealthFeedback,
	type HealthFeedback,
	healthFeedbackReady,
} from '../model/healthFeedback';
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
const slots = [0, 1, 2, 3];
export function WormLabel({
	worm,
	feedback: sharedFeedback,
}: {
	worm: Worm;
	feedback?: HealthFeedback;
}) {
	const feedback = useRef(createHealthFeedback(worm.hp));
	const floating = useRef<(HTMLDivElement | null)[]>([]);
	const signature = useRef('');
	const [health, setHealth] = useState({ hp: worm.hp, alive: worm.alive, amounts: [] as number[] });
	useFrame((_, delta) => {
		const state =
			sharedFeedback ??
			advanceHealthFeedback(
				feedback.current,
				worm.hp,
				Math.min(delta, 0.15),
				healthFeedbackReady(worm)
			);
		const visible = worm.alive || Boolean(worm.deathPending);
		const nextSignature = `${state.displayed}:${visible}:${state.notices.map((n) => n.id).join(',')}`;
		if (nextSignature !== signature.current) {
			signature.current = nextSignature;
			setHealth({
				hp: state.displayed,
				alive: visible,
				amounts: state.notices.map((n) => n.amount),
			});
		}
		for (const index of slots) {
			const element = floating.current[index],
				notice = state.notices[index];
			if (!element) continue;
			element.style.display =
				notice && health.amounts[index] === notice.amount ? 'inline-flex' : 'none';
			if (notice)
				element.style.transform = `translate(-50%,${-24 - notice.age * 32 - index * 22}px)`;
		}
	});
	const color = TEAM_COLORS[worm.team];
	return (
		<Html
			distanceFactor={1}
			center
			position={[0, 46, 0.2]}
			zIndexRange={[20, 0]}
			style={{
				pointerEvents: 'none',
				display: health.alive || health.amounts.length ? 'block' : 'none',
			}}
		>
			<div
				data-worm-label={worm.id}
				style={{
					position: 'relative',
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
				<div style={{ ...frameStyle, display: health.alive ? 'inline-flex' : 'none' }}>
					<WormsVectorText text={worm.name} />
				</div>
				<div
					data-displayed-hp={health.hp}
					style={{ ...frameStyle, display: health.alive ? 'inline-flex' : 'none' }}
				>
					<WormsVectorText text={String(health.hp)} height={10} />
				</div>
				{slots.map((index) => (
					<div
						key={index}
						ref={(element) => {
							floating.current[index] = element;
						}}
						data-damage-notice={health.amounts[index] ?? ''}
						style={{
							...frameStyle,
							position: 'absolute',
							top: 0,
							left: '50%',
							color: '#fff',
							display: 'none',
						}}
					>
						<WormsVectorText text={String(health.amounts[index] ?? '')} height={10} />
					</div>
				))}
			</div>
		</Html>
	);
}
