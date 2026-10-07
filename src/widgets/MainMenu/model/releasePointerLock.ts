/** A delayed game-menu lock request must not capture the pointer over the main menu. */
export function keepMenuPointerUnlocked(target: Document) {
	const release = () => {
		if (target.pointerLockElement) target.exitPointerLock();
	};
	target.addEventListener('pointerlockchange', release);
	release();
	return () => target.removeEventListener('pointerlockchange', release);
}
