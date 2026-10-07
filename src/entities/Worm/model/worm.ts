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
	| 'twang'
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
	/** Eliminated from turns immediately, but finishes physics and HP feedback before dying. */
	deathPending?: boolean;
	grounded: boolean;
	/** A queued blast must enter the airborne sweep before support can zero its velocity. */
	impulsePending?: boolean;
	knockedBack?: boolean;
	/** Standard W:A disables fall damage throughout explosion-driven flight/sliding. */
	blastFallProtected?: boolean;
	sliding?: boolean;
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
	worm.deathPending = false;
	worm.alive = false;
	worm.hp = 0;
	worm.grounded = false;
	worm.velocity.x = worm.velocity.y = 0;
	setAnimation(worm, cause);
}

export function fallDamage(impactSpeed: number): number {
	if (impactSpeed < WORM.safeImpact) return 0;
	const speed = Math.min(WORM.maxFallSpeed, impactSpeed) / WORM.fallDamageFrameRate;
	return Math.floor(((speed - 8 + 1 / 65536) * WORM.fallDamageCoefficient + 18) / 18);
}
