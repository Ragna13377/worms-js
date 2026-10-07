import type { GameInput } from '../../widgets/Gameplay/model/simulation';
import type { InputCommit, Seat } from './protocol';

export class InputTimeline {
	tick = 0;
	lastSequence = 0;
	private lastEffectiveTick = -1;
	private events: InputCommit[] = [];
	private move: -1 | 0 | 1 = 0;
	private aim: -1 | 0 | 1 = 0;
	get queued() {
		return this.events.length;
	}
	enqueue(event: InputCommit) {
		if (event.serverSequence <= this.lastSequence) return;
		if (
			event.serverSequence !== this.lastSequence + 1 ||
			event.effectiveTick < this.lastEffectiveTick
		)
			throw new Error('BAD_SEQUENCE');
		if (event.effectiveTick < this.tick) throw new Error('LATE_INPUT');
		this.lastSequence = event.serverSequence;
		this.lastEffectiveTick = event.effectiveTick;
		this.events.push(event);
	}
	neutralize() {
		this.move = this.aim = 0;
	}
	consume(turnIndex: number, owner: Seat | null): GameInput {
		const commands: GameInput['commands'] = [];
		while (this.events[0]?.effectiveTick === this.tick) {
			const event = this.events.shift();
			if (!event || event.turnIndex !== turnIndex || event.seat !== owner) continue;
			this.move = event.change.moveDirection ?? this.move;
			this.aim = event.change.aimDirection ?? this.aim;
			commands.push(...event.change.commands);
		}
		if (!owner) this.neutralize();
		this.tick++;
		return { moveDirection: this.move, aimDirection: this.aim, commands };
	}
}
