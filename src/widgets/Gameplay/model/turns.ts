import { isBotTurn } from '../../../entities/Bot/model/controller';
import {
	canControl,
	MATCH,
	matchResult,
	nextLivingCursor,
	timeoutResult,
} from '../../../entities/Match/model/match';
import { cancelCharge } from '../../../entities/Weapon/model/weapon';
import { WORM } from '../../../entities/Worm/model/config';
import type { Game } from './simulation';

export function canControlWorm(game: Game) {
	return (
		canControl(game.match) && game.worms.some((w) => w.id === game.match.activeWormId && w.alive)
	);
}
export const canAim = canControlWorm;
export function canPrepareTurn(game: Game) {
	return (
		game.match.turnState === 'TURN_START' &&
		game.worms.some((w) => w.id === game.match.activeWormId && w.alive)
	);
}
export function startPreparedTurn(game: Game, action = false) {
	if (!canPrepareTurn(game)) return;
	game.match.turnState = 'CONTROL';
	game.match.phaseTime = 0;
	game.match.turnTimeRemaining = MATCH.turnSeconds;
	game.turnMarker = false;
	if (action) game.inputNeedsNeutral = false;
}
export const canOpenWeaponMenu = (game: Game) =>
	!game.paused && !isBotTurn(game) && (canControlWorm(game) || canPrepareTurn(game));
export const canChangeFuse = canControlWorm;
export function canStartCharge(game: Game) {
	return canControlWorm(game) && !game.projectiles.length && !game.weapon.isCharging;
}
/** Gameplay resolution only; visual particles are deliberately excluded. */
export function isWorldSettled(game: Game) {
	return (
		!game.projectiles.length &&
		!game.explosions.queue.length &&
		game.worms.every((w) =>
			w.alive
				? w.grounded &&
					!w.sliding &&
					!w.impulsePending &&
					!w.knockedBack &&
					Math.hypot(w.velocity.x, w.velocity.y) < MATCH.velocityEpsilon &&
					w.animationState === 'idle'
				: game.explosions.deathEmitted.has(w.id) &&
					(w.animationState === 'drown'
						? w.stateTime >= WORM.drownDuration
						: w.stateTime >= WORM.deathDuration)
		)
	);
}
export function isHealthFeedbackComplete(game: Game) {
	return game.worms.every((w) => {
		const hp = game.healthFeedback.get(w.id);
		return !hp || (hp.actual === w.hp && hp.displayed === w.hp && !hp.notices.length);
	});
}
export function leaveControl(game: Game, state: 'FIRING' | 'SETTLING') {
	game.match.turnState = state;
	game.match.phaseTime = 0;
	game.match.settleStableTime = 0;
	game.inputNeedsNeutral = true;
	game.pendingCommands.length = 0;
	game.fuseNotice = null;
	game.turnMarker = false;
	cancelCharge(game.weapon);
}
function finishMatch(game: Game) {
	const result =
		matchResult(game.worms) ??
		(game.match.matchTimeRemaining === 0 ? timeoutResult(game.worms) : null);
	if (result === null) return false;
	game.match.result = result;
	game.match.endedAt = game.time;
	game.match.turnState = 'MATCH_END';
	game.match.activeWormId = null;
	for (const worm of game.worms) if (worm.alive) worm.stateTime = 0;
	game.pendingCommands.length = 0;
	game.inputNeedsNeutral = true;
	game.turnMarker = false;
	game.fuseNotice = null;
	cancelCharge(game.weapon);
	return true;
}
export function advanceMatchClock(game: Game, dt: number) {
	const match = game.match;
	if (match.turnState === 'MATCH_END') return;
	match.matchTimeRemaining = Math.max(0, match.matchTimeRemaining - dt);
	if (match.matchTimeRemaining < 1e-9) {
		match.matchTimeRemaining = 0;
		if (match.turnState !== 'SETTLING') leaveControl(game, 'SETTLING');
		return;
	}
	match.phaseTime += dt;
	if (match.turnState === 'TURN_END') {
		if (finishMatch(game)) return;
		const cursor = nextLivingCursor(match, game.worms);
		if (cursor === null) {
			finishMatch(game);
			return;
		}
		const previousTeam = game.worms.find((w) => w.id === match.turnOrder[match.turnCursor])?.team;
		match.teamTurnCursor ??= { RED: -1, BLUE: -1 };
		if (previousTeam) match.teamTurnCursor[previousTeam] = match.turnCursor;
		if (previousTeam) game.teamWeapons[previousTeam] = game.weapon.selectedWeapon;
		match.turnCursor = cursor;
		const nextTeam = game.worms.find((w) => w.id === match.turnOrder[cursor])?.team;
		if (nextTeam) match.teamTurnCursor[nextTeam] = cursor;
		if (nextTeam) game.weapon.selectedWeapon = game.teamWeapons[nextTeam];
		match.turnIndex++;
		match.activeWormId = match.turnOrder[cursor];
		match.turnState = 'TURN_START';
		match.phaseTime = 0;
		match.turnTimeRemaining = MATCH.turnSeconds;
		match.settleStableTime = 0;
		game.lastShotResult = null;
		game.pendingCommands.length = 0;
		game.fuseNotice = null;
		game.turnMarker = true;
		game.inputNeedsNeutral = true;
		cancelCharge(game.weapon);
	} else if (match.turnState === 'TURN_START') {
		if (!game.worms.some((w) => w.id === match.activeWormId && w.alive)) {
			match.turnState = 'SETTLING';
			match.phaseTime = 0;
			return;
		}
		if (match.phaseTime + 1e-9 >= MATCH.introSeconds) {
			startPreparedTurn(game);
		}
	} else if (match.turnState === 'CONTROL') {
		match.turnTimeRemaining = Math.max(0, match.turnTimeRemaining - dt);
		if (match.turnTimeRemaining < 1e-9) match.turnTimeRemaining = 0;
		if (!canControlWorm(game) || !match.turnTimeRemaining) leaveControl(game, 'SETTLING');
	}
}
export function advanceMatchResolution(game: Game, dt: number) {
	if (game.match.turnState === 'FIRING' && !game.projectiles.length) leaveControl(game, 'SETTLING');
	if (
		game.match.turnState === 'CONTROL' &&
		(!canControlWorm(game) || matchResult(game.worms) !== null)
	)
		leaveControl(game, 'SETTLING');
	if (game.match.turnState !== 'SETTLING') return;
	const result = game.lastShotResult;
	const observationComplete =
		!result || result.submerged || game.time + dt - result.time >= MATCH.observationSeconds;
	if (!isWorldSettled(game) || !isHealthFeedbackComplete(game) || !observationComplete) {
		game.match.settleStableTime = 0;
		return;
	}
	game.match.settleStableTime += dt;
	if (game.match.settleStableTime + 1e-9 < MATCH.stabilitySeconds) return;
	if (!finishMatch(game)) {
		game.match.turnState = 'TURN_END';
		game.match.phaseTime = 0;
	}
}
