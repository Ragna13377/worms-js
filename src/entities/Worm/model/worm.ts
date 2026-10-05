import { WORM } from './config';

export type Team = 'RED' | 'BLUE';
export type Facing = 'left' | 'right';
export type AnimationState =
	| 'idle'
	| 'walk'
	| 'jump'
	| 'fall'
	| 'land'
	| 'hurt'
	| 'death'
	| 'drown';
export type JumpType = 'forward' | 'high' | 'backflip';
export type Worm = {
	id: string;
	name: string;
	team: Team;
	position: { x: number; y: number };
	previousPosition: { x: number; y: number };
	velocity: { x: number; y: number };
	facing: Facing;
	collisionRadius: number;
	hp: number;
	alive: boolean;
	grounded: boolean;
	/** A queued blast must enter the airborne sweep before support can zero its velocity. */
	impulsePending?: boolean;
	animationState: AnimationState;
	stateTime: number;
	jumpType: JumpType | null;
	jumpTime: number;
	highJumpStartedAt: number;
};

export function createWorm(id: string, team: Team, x: number, y: number): Worm {
	return {
		id,
		name: id,
		team,
		position: { x, y },
		previousPosition: { x, y },
		velocity: { x: 0, y: 0 },
		facing: team === 'RED' ? 'right' : 'left',
		collisionRadius: WORM.radius,
		hp: 100,
		alive: true,
		grounded: true,
		animationState: 'idle',
		stateTime: 0,
		jumpType: null,
		jumpTime: 0,
		highJumpStartedAt: -Infinity,
	};
}

export function setAnimation(worm: Worm, state: AnimationState) {
	if (worm.animationState === state) return;
	worm.animationState = state;
	worm.stateTime = 0;
}

export function killWorm(worm: Worm, cause: 'death' | 'drown') {
	worm.alive = false;
	worm.hp = 0;
	worm.grounded = false;
	worm.velocity.x = worm.velocity.y = 0;
	setAnimation(worm, cause);
}

export function fallDamage(impactSpeed: number): number {
	return Math.min(
		100,
		Math.max(0, Math.floor((impactSpeed - WORM.safeImpact) * WORM.damagePerSpeed))
	);
}
