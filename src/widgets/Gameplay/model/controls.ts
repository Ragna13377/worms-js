import type { Command, GameInput } from './simulation';

export const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', 'Tab']);

/** Browser adapter calls these methods; repeat/held state stays outside the worm domain. */
export class GameplayControls {
	private held = new Set<string>();
	private commands: Command[] = [];
	private directionTap: -1 | 0 | 1 = 0;

	press(code: string, repeat = false) {
		if (!GAME_KEYS.has(code)) return false;
		this.held.add(code);
		if (!repeat) {
			if (code === 'ArrowLeft') this.directionTap = -1;
			if (code === 'ArrowRight') this.directionTap = 1;
			if (code === 'Enter') this.commands.push('forwardJump');
			if (code === 'Backspace') this.commands.push('highJump');
			if (code === 'Tab') this.commands.push('cycle');
		}
		return true;
	}

	release(code: string) {
		this.held.delete(code);
	}

	clear() {
		this.held.clear();
		this.commands.length = 0;
		this.directionTap = 0;
	}

	consume(): GameInput {
		const moveDirection = (Number(this.held.has('ArrowRight')) -
			Number(this.held.has('ArrowLeft'))) as -1 | 0 | 1;
		const commands = this.commands.splice(0);
		if (!this.held.has('ArrowLeft') && !this.held.has('ArrowRight') && this.directionTap)
			commands.push(this.directionTap < 0 ? 'moveLeft' : 'moveRight');
		this.directionTap = 0;
		return { moveDirection, commands };
	}
}
