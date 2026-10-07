import { describe, expect, it, vi } from 'vitest';
import { keepMenuPointerUnlocked } from '../src/widgets/MainMenu/model/releasePointerLock';

describe('main menu pointer lifecycle', () => {
	it('releases a game lock and also a pending lock that resolves after exiting the game', () => {
		const target = new EventTarget();
		const document = Object.assign(target, {
			pointerLockElement: {} as Element | null,
			exitPointerLock: vi.fn(() => {
				Object.assign(document, { pointerLockElement: null });
			}),
		}) as unknown as Document;
		const cleanup = keepMenuPointerUnlocked(document);
		expect(document.pointerLockElement).toBeNull();
		expect(document.exitPointerLock).toHaveBeenCalledTimes(1);
		Object.assign(document, { pointerLockElement: {} });
		document.dispatchEvent(new Event('pointerlockchange'));
		expect(document.pointerLockElement).toBeNull();
		expect(document.exitPointerLock).toHaveBeenCalledTimes(2);
		document.dispatchEvent(new Event('pointerlockchange'));
		expect(document.exitPointerLock).toHaveBeenCalledTimes(2);
		cleanup();
		Object.assign(document, { pointerLockElement: {} });
		document.dispatchEvent(new Event('pointerlockchange'));
		expect(document.pointerLockElement).not.toBeNull();
		expect(document.exitPointerLock).toHaveBeenCalledTimes(2);
	});
});
