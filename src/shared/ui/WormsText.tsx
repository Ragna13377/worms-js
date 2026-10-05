import glyphs from '@/public/assets/fonts/worms-white.json';
import atlas from '@/public/assets/fonts/worms-white.png';

/** Original bitmap glyphs. Unsupported text keeps the regular UI font (including Cyrillic). */
export function WormsText({ text }: { text: string }) {
	const characters = Array.from(text);
	if (characters.some((character) => character !== ' ' && !(character in glyphs)))
		return <span>{text}</span>;
	return (
		<span role='img' aria-label={text} style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
			{characters.map((character, index) => {
				const glyph = glyphs[character as keyof typeof glyphs];
				return (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: Static glyph positions have no state.
						key={index}
						aria-hidden='true'
						style={{
							display: 'inline-block',
							flexShrink: 0,
							width: glyph ? glyph.width + 1 : 7,
							height: 24,
							backgroundImage: glyph ? `url(${atlas.src})` : undefined,
							backgroundPosition: glyph ? `-${glyph.x}px -${glyph.y}px` : undefined,
							backgroundRepeat: 'no-repeat',
							imageRendering: 'pixelated',
						}}
					/>
				);
			})}
		</span>
	);
}
