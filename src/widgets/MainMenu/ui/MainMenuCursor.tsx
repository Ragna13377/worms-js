import { useEffect, useRef } from 'react';
import cursorArt from '../assets/cursor.png';
import styles from './MainMenu.module.css';

export function MainMenuCursor() {
	const ref = useRef<HTMLImageElement>(null);
	useEffect(() => {
		const image = ref.current;
		const surface = image?.parentElement;
		if (!image || !surface) return;
		const hide = () => {
			image.style.visibility = 'hidden';
		};
		const move = (event: PointerEvent) => {
			if (event.pointerType === 'touch') return;
			// The visible arrow tip is pixel (1, 0), exactly at the pointer's hit position.
			image.style.transform = `translate3d(${event.clientX - 1}px, ${event.clientY}px, 0)`;
			image.style.visibility = 'visible';
		};
		surface.addEventListener('pointermove', move);
		surface.addEventListener('pointerleave', hide);
		window.addEventListener('blur', hide);
		document.addEventListener('visibilitychange', hide);
		return () => {
			surface.removeEventListener('pointermove', move);
			surface.removeEventListener('pointerleave', hide);
			window.removeEventListener('blur', hide);
			document.removeEventListener('visibilitychange', hide);
		};
	}, []);
	return (
		// biome-ignore lint/performance/noImgElement: Pointer artwork must follow the pointer without image processing.
		<img
			ref={ref}
			className={styles.pointer}
			src={cursorArt.src}
			width={38}
			height={48}
			alt=''
			aria-hidden='true'
		/>
	);
}
