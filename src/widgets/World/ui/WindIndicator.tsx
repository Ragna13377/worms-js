import type { GameWorld } from '@entities/World/model/world';
import { useI18n } from '@shared/i18n';
import { useEffect, useState } from 'react';

const WIND_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const STEP = 5.5;

/** Screen-space meter drawn from the supplied Armageddon reference. */
export function WindIndicator({ world }: { world: GameWorld }) {
	const { t } = useI18n();
	const [wind, setWind] = useState(world.wind);
	useEffect(() => {
		let frame = 0,
			start = 0,
			previous = world.wind,
			target = world.wind,
			displayed = world.wind;
		const update = (time: number) => {
			if (target !== world.wind) {
				previous = displayed;
				target = world.wind;
				start = time;
			}
			if (start) {
				const t = Math.min(1, (time - start) / 500);
				displayed = t < 0.4 ? previous * (1 - t / 0.4) : target * ((t - 0.4) / 0.6);
				setWind(displayed);
				if (t === 1) start = 0;
			}
			frame = requestAnimationFrame(update);
		};
		setWind(world.wind);
		frame = requestAnimationFrame(update);
		return () => cancelAnimationFrame(frame);
	}, [world]);
	const strength = Math.min(1, Math.abs(wind));
	const count = strength < 0.01 ? 0 : Math.ceil(strength * WIND_LEVELS.length);
	const leftward = wind < 0;
	const fillWidth = strength * WIND_LEVELS.length * STEP;
	return (
		<svg
			role='img'
			aria-label={
				count
					? t('wind')
							.replace('{direction}', t(leftward ? 'left' : 'right'))
							.replace('{count}', String(count))
					: t('calm')
			}
			width='146'
			height='14'
			viewBox='0 0 146 14'
			style={{
				position: 'absolute',
				right: 'calc(8 * var(--ui-unit))',
				bottom: 'calc(8 * var(--ui-unit))',
				width: 'calc(146 * var(--ui-unit))',
				height: 'calc(14 * var(--ui-unit))',
				pointerEvents: 'none',
			}}
		>
			<title>{t('windTitle')}</title>
			<defs>
				<clipPath id='wind-fill'>
					<rect x={leftward ? 72 - fillWidth : 74} y='2' width={fillWidth} height='10' />
				</clipPath>
				<linearGradient id='wind-frame' x2='0' y2='1'>
					<stop offset='0' stopColor='#9da3b6' />
					<stop offset='0.5' stopColor='#777c88' />
					<stop offset='1' stopColor='#b4bdc3' />
				</linearGradient>
				<linearGradient id='wind-blue' x2='0' y2='1'>
					<stop offset='0' stopColor='#3b4072' />
					<stop offset='0.5' stopColor='#5357bc' />
					<stop offset='1' stopColor='#2c3475' />
				</linearGradient>
				<linearGradient id='wind-red' x2='0' y2='1'>
					<stop offset='0' stopColor='#713839' />
					<stop offset='0.5' stopColor='#b64d54' />
					<stop offset='1' stopColor='#722b35' />
				</linearGradient>
			</defs>
			<rect width='146' height='14' rx='2' fill='#202332' />
			<rect x='0.5' y='0.5' width='145' height='13' rx='1.5' fill='url(#wind-frame)' />
			<rect x='2' y='2' width='142' height='10' rx='0.5' fill='#020205' />
			{count > 0 && (
				<rect
					x={leftward ? 72 - fillWidth : 74}
					y='2'
					width={fillWidth}
					height='10'
					fill={leftward ? 'url(#wind-blue)' : 'url(#wind-red)'}
				/>
			)}
			<g clipPath='url(#wind-fill)'>
				{WIND_LEVELS.filter((level) => level <= count).map((level) => (
					<path
						key={level}
						d={
							leftward
								? `M ${71 - (level - 1) * STEP} 3 l -4.5 4 l 4.5 4 z`
								: `M ${75 + (level - 1) * STEP} 3 l 4.5 4 l -4.5 4 z`
						}
						fill={leftward ? '#9699f7' : '#f79999'}
					/>
				))}
			</g>
			<rect x='72' y='1' width='2' height='12' fill='url(#wind-frame)' />
		</svg>
	);
}
