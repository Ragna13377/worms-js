import glyphs from '@/public/assets/fonts/worms-vector.json';

/** Original letter contours with vector antialiasing and tight visible-ink alignment. */
export function WormsVectorText({ text, height = 12 }: { text: string; height?: number }) {
	const characters = Array.from(text);
	if (characters.some((character) => character !== ' ' && !(character in glyphs)))
		return <span>{text}</span>;
	const ink = characters
		.filter((character) => character !== ' ')
		.map((character) => glyphs[character as keyof typeof glyphs]);
	if (!ink.length) return <span>{text}</span>;
	const top = Math.min(...ink.map((glyph) => glyph.top));
	const bottom = Math.max(...ink.map((glyph) => glyph.bottom));
	let advance = 0;
	const positioned = characters.map((character) => {
		const glyph = glyphs[character as keyof typeof glyphs];
		const x = advance;
		advance += glyph ? glyph.width + 1.5 : 5;
		return { glyph, x };
	});
	const width = Math.max(1, advance - 1.5);
	return (
		<svg
			role='img'
			aria-label={text}
			width={(width * height) / (bottom - top)}
			height={height}
			viewBox={`0 ${top} ${width} ${bottom - top}`}
			style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
		>
			{positioned.map(
				({ glyph, x }, index) =>
					glyph && (
						<path
							// biome-ignore lint/suspicious/noArrayIndexKey: Static glyph positions have no state.
							key={index}
							d={glyph.path}
							transform={`translate(${x} 0)`}
							fill='currentColor'
							fillRule='evenodd'
						/>
					)
			)}
		</svg>
	);
}
