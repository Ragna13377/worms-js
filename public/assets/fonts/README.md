# Worms Armageddon bitmap font

Source: https://www.spriters-resource.com/pc_computer/wormsgeddon/asset/81964/

Original art: Team17. Extracted by Random Talking Bush.
Downloaded asset: `worms-fonts.png` (801 × 1873), a PNG sheet, not a TTF/OTF font.

`worms-white.png` and `worms-white.json` contain the first two rows of the
large white font: Latin letters, digits, backtick and exclamation mark.
The sheet background and grid are removed; original glyph pixels are preserved.
Regenerate from the repository root with `pwsh -File scripts/extract-worms-font.ps1`.

`src/shared/ui/WormsText.tsx` renders these glyphs at their original size with
transparent backgrounds. The scene seed uses this component. Unsupported text,
including Cyrillic, falls back to the regular UI font. The complete source sheet
is retained for extracting other sizes, colours and characters later.
