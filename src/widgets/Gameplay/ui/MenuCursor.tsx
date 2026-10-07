import { useI18n } from '@shared/i18n';
import cursorArt from '@src/assets/props/Misc/cursorr.png';
import { useEffect, useRef } from 'react';

/** The same original sprite frame and transparency key for both game menus. */
export function MenuCursor({ x, y }: { x: number; y: number }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const image = new Image();
		image.onload = () => {
			const context = ref.current?.getContext('2d');
			if (!context) return;
			context.imageSmoothingEnabled = false;
			context.drawImage(image, 0, 20 * 60, 60, 60, 0, 0, 60, 60);
			const pixels = context.getImageData(0, 0, 60, 60);
			for (let i = 0; i < pixels.data.length; i += 4)
				if (pixels.data[i] === 128 && pixels.data[i + 1] === 128 && pixels.data[i + 2] === 192)
					pixels.data[i + 3] = 0;
			context.putImageData(pixels, 0, 0);
		};
		image.src = cursorArt.src;
		return () => {
			image.onload = null;
		};
	}, []);
	const { t } = useI18n();
	return (
		<canvas
			ref={ref}
			width={60}
			height={60}
			tabIndex={-1}
			aria-label={t('menuCursor')}
			style={{
				position: 'absolute',
				left: `calc(${x}px - 20 * var(--ui-unit))`,
				top: `calc(${y}px - 20 * var(--ui-unit))`,
				width: 'calc(60 * var(--ui-unit))',
				height: 'calc(60 * var(--ui-unit))',
				pointerEvents: 'none',
				imageRendering: 'pixelated',
				zIndex: 3,
			}}
		/>
	);
}
