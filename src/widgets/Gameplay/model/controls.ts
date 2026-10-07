import type { Command, GameInput } from './simulation';
export const GAME_KEYS = new Set([
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'Enter',
	'Backspace',
	'Space',
	'F1',
	'F2',
	'KeyQ',
	'Digit1',
	'Digit2',
	'Digit3',
	'Digit4',
	'Digit5',
]);
/** Browser edges only; all weapon clocks and effects belong to advanceGame. */
export class GameplayControls {
	private held = new Set<string>();
	private blocked = new Set<string>();
	private enabled = true;
	setEnabled(enabled: boolean) {
		if (enabled === this.enabled) return;
		if (!enabled) for (const code of this.held) this.blocked.add(code);
		this.clear();
		this.enabled = enabled;
	}
	private commands: Command[] = [];
	private directionTap: -1 | 0 | 1 = 0;
	private aimTap: -1 | 0 | 1 = 0;
	press(code: string, repeat = false) {
		if (!GAME_KEYS.has(code)) return false;
		if (!this.enabled) {
			this.blocked.add(code);
			return true;
		}
		if (this.blocked.has(code)) return true;
		const alreadyHeld = this.held.has(code);
		this.held.add(code);
		if (!repeat && !alreadyHeld) {
			if (code === 'ArrowLeft') this.directionTap = -1;
			if (code === 'ArrowRight') this.directionTap = 1;
			if (code === 'ArrowUp') this.aimTap = 1;
			if (code === 'ArrowDown') this.aimTap = -1;
			if (code === 'Enter') this.commands.push('forwardJump');
			if (code === 'Backspace') this.commands.push('highJump');
			if (code === 'F1') this.commands.push('bazooka');
			if (code === 'F2') this.commands.push('grenade');
			if (code === 'KeyQ') this.commands.push('switchWeapon');
			if (code === 'Space') this.commands.push('chargeStart');
			if (/^Digit[1-5]$/.test(code)) this.commands.push(`fuse${code.slice(-1)}` as Command);
		}
		return true;
	}
	release(code: string) {
		this.blocked.delete(code);
		if (this.enabled && code === 'Space' && this.held.has(code)) this.commands.push('fire');
		this.held.delete(code);
	}
	clear() {
		const cancel =
			this.held.has('Space') || this.commands.some((c) => c === 'chargeStart' || c === 'fire');
		this.held.clear();
		this.commands.length = 0;
		this.directionTap = 0;
		this.aimTap = 0;
		if (cancel) this.commands.push('cancelCharge');
	}
	consume(): GameInput {
		if (!this.enabled) {
			this.commands.length = 0;
			return { moveDirection: 0, commands: [] };
		}
		const moveDirection = (Number(this.held.has('ArrowRight')) -
			Number(this.held.has('ArrowLeft'))) as -1 | 0 | 1;
		const aimDirection = (Number(this.held.has('ArrowUp')) - Number(this.held.has('ArrowDown'))) as
			| -1
			| 0
			| 1;
		const commands = this.commands.splice(0);
		if (!aimDirection && this.aimTap) commands.push(this.aimTap > 0 ? 'aimUp' : 'aimDown');
		this.aimTap = 0;
		if (!this.held.has('ArrowLeft') && !this.held.has('ArrowRight') && this.directionTap)
			commands.push(this.directionTap < 0 ? 'moveLeft' : 'moveRight');
		this.directionTap = 0;
		return { moveDirection, ...(aimDirection ? { aimDirection } : {}), commands };
	}
}
