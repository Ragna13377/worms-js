const WIND_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Screen-space wind meter: blue left, red right, triangles count strength. */
export function WindIndicator({ wind }: { wind: number }) {
	const strength = Math.abs(wind);
	const count = strength < 0.01 ? 0 : Math.ceil(strength * 10);
	return (
		<svg
			role='img'
			aria-label={
				count ? `Ветер ${wind < 0 ? 'влево' : 'вправо'}, ${Math.round(strength * 100)}%` : 'Штиль'
			}
			width='206'
			height='20'
			viewBox='0 0 206 20'
			style={{ position: 'absolute', right: 18, bottom: 18, pointerEvents: 'none' }}
		>
			<title>Направление и сила ветра</title>
			<rect x='0.5' y='0.5' width='100' height='19' fill='#08080e' stroke='#626274' />
			<rect x='105.5' y='0.5' width='100' height='19' fill='#08080e' stroke='#626274' />
			{WIND_LEVELS.map((level) => (
				<g key={level}>
					<path
						d={`M ${97 - (level - 1) * 9} 4 l -7 6 l 7 6 z`}
						fill={wind < 0 && level <= count ? '#777bed' : '#1b1c29'}
					/>
					<path
						d={`M ${109 + (level - 1) * 9} 4 l 7 6 l -7 6 z`}
						fill={wind > 0 && level <= count ? '#ef6666' : '#1b1c29'}
					/>
				</g>
			))}
		</svg>
	);
}
