import glyphs from '@/public/assets/fonts/worms-white.json';
import atlas from '@/public/assets/fonts/worms-white.png';

/** Intact bitmap glyphs. A mask supplies team colors without making extra font images. */
export function WormsText({
	text,
	size = 24,
	color,
}: {
	text: string;
	size?: number;
	color?: string;
}) {
	const characters = Array.from(text);
	if (characters.some((character) => character !== ' ' && !(character in glyphs)))
		return <span style={{ fontSize: size, color }}>{text}</span>;
	const scale = size / 24;
	return (
		<span role='img' aria-label={text} style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
			{characters.map((character, index) => {
				const glyph = glyphs[character as keyof typeof glyphs];
				const url = glyph ? `url(${atlas.src})` : undefined;
				const position = glyph ? `-${glyph.x * scale}px -${glyph.y * scale}px` : undefined;
				const atlasSize = `${atlas.width * scale}px ${atlas.height * scale}px`;
				return (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: Static glyph positions have no state.
						key={index}
						aria-hidden='true'
						style={{
							display: 'inline-block',
							flexShrink: 0,
							width: (glyph ? glyph.width + 1 : 7) * scale,
							height: size,
							imageRendering: 'pixelated',
							...(color
								? {
										backgroundColor: glyph ? color : undefined,
										maskImage: url,
										maskPosition: position,
										maskSize: atlasSize,
										maskRepeat: 'no-repeat',
									}
								: {
										backgroundImage: url,
										backgroundPosition: position,
										backgroundSize: atlasSize,
										backgroundRepeat: 'no-repeat',
									}),
						}}
					/>
				);
			})}
		</span>
	);
}
