import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useI18n } from '@shared/i18n';
import gameUi from '@shared/ui/GameUi.module.css';
import { useMemo, useRef } from 'react';
import { TEAM_COLORS } from '../../../entities/Match/model/colors';
import { MATCH, teamCurrentHp, teamMaxHp } from '../../../entities/Match/model/match';
import { matchOutro, rankedTeams, teamDisplayedHp } from '../model/matchPresentation';
import type { Game } from '../model/simulation';
import styles from './MatchHud.module.css';

export function MatchHud({ game, onExit }: { game: Game; onExit: () => void }) {
	const { t } = useI18n();
	const teamName = (team: 'RED' | 'BLUE') => {
		const name = game.match.config.teamNames[team];
		const label = name === team ? t(team) : name;
		return game.match.config.mode.type === 'bot' && game.match.config.mode.botTeam === team
			? `${label} · BOT`
			: label;
	};
	const root = useRef<HTMLDivElement>(null);
	const hudState = useMemo(
		() => ({ game, order: ['BLUE', 'RED'] as ('RED' | 'BLUE')[], exited: false }),
		[game]
	);
	useFrame(() => {
		const element = root.current;
		if (!element) return;
		const match = game.match,
			active = game.worms.find((w) => w.id === match.activeWormId);
		const outro = matchOutro(hudState.game);
		element.dataset.outroPhase = outro.done
			? 'done'
			: outro.fade > 0
				? 'fade'
				: outro.announce
					? 'celebration'
					: outro.slide
						? 'slide'
						: outro.age >= 0
							? 'empty'
							: 'playing';
		hudState.order = rankedTeams(game, hudState.order);
		const timer = element.querySelector<HTMLOutputElement>('[data-turn-timer]');
		const teamColor = TEAM_COLORS[active?.team ?? 'BLUE'];
		if (timer) {
			timer.textContent = String(Math.ceil(match.turnTimeRemaining));
			timer.style.borderColor = teamColor;
			timer.style.color =
				match.turnTimeRemaining <= 5 ? '#ff5050' : match.turnState === 'CONTROL' ? '#fff' : '#999';
		}
		const clock = element.querySelector<HTMLOutputElement>('[data-match-timer]');
		const remaining = Math.ceil(match.matchTimeRemaining);
		if (clock)
			clock.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
		const turn = element.querySelector<HTMLOutputElement>('[data-turn-identity]');
		if (turn) {
			turn.hidden = match.turnState !== 'TURN_START';
			turn.textContent = active
				? `${teamName(active.team)} : ${Math.max(1, Math.ceil(MATCH.introSeconds - match.phaseTime))} ${t('seconds')}`
				: '';
			turn.style.color = teamColor;
		}
		for (const team of ['RED', 'BLUE'] as const) {
			const hp = teamDisplayedHp(game, team),
				max = teamMaxHp(match, team);
			const row = element.querySelector<HTMLDivElement>(`[data-team-row="${team}"]`);
			if (row) {
				const leaving = outro.slide && teamCurrentHp(game.worms, team) === 0;
				row.style.transform = leaving
					? 'translateY(calc(100 * var(--ui-unit)))'
					: `translateY(calc(${hudState.order.indexOf(team) * 19} * var(--ui-unit)))`;
				row.style.opacity = leaving ? '0' : '1';
				row.dataset.rank = String(hudState.order.indexOf(team));
			}
			const bar = element.querySelector<HTMLDivElement>(`[data-team-bar="${team}"]`);
			if (bar) {
				bar.style.width = `${max ? (hp / max) * 100 : 0}%`;
				bar.parentElement?.setAttribute('aria-valuenow', String(hp));
			}
		}
		const end = element.querySelector<HTMLDivElement>('[data-match-end]');
		if (end) end.hidden = !outro.announce;
		const fade = element.querySelector<HTMLDivElement>('[data-match-fade]');
		if (fade) fade.style.opacity = String(outro.fade);
		if (outro.done && !hudState.exited) {
			hudState.exited = true;
			onExit();
		}
		const result = element.querySelector<HTMLOutputElement>('[data-match-result]');
		if (result) {
			result.style.color =
				match.result && match.result !== 'DRAW' ? TEAM_COLORS[match.result] : '#fff';
			result.textContent =
				match.result === 'DRAW'
					? t('draw')
					: match.result
						? t('victory').replace('{team}', teamName(match.result))
						: '';
		}
	});
	return (
		<Html
			fullscreen
			calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
			zIndexRange={[28, 28]}
			style={{ pointerEvents: 'none' }}
		>
			<div ref={root} className={styles.hud}>
				<div className={styles.teams}>
					{(['BLUE', 'RED'] as const).map((team) => (
						<div
							key={team}
							data-team-row={team}
							className={styles.team}
							style={{
								color: TEAM_COLORS[team],
								transform: `translateY(calc(${team === 'BLUE' ? 0 : 19} * var(--ui-unit)))`,
							}}
						>
							<span className={styles.name}>{teamName(team)}</span>
							<span className={styles.emblem} aria-hidden='true'>
								⚔
							</span>
							<div
								className={styles.track}
								role='progressbar'
								aria-label={`${teamName(team)} ${t('hp')}`}
								aria-valuemin={0}
								aria-valuemax={teamMaxHp(game.match, team)}
								aria-valuenow={teamMaxHp(game.match, team)}
							>
								<div className={styles.bar} data-team-bar={team} />
							</div>
						</div>
					))}
				</div>
				<output className={styles.preparation} data-turn-identity />
				<div className={styles.turn}>
					<output className={gameUi.readout} data-match-timer aria-label={t('matchClock')}>
						10:00
					</output>
					<output className={styles.timer} data-turn-timer aria-label={t('turnClock')}>
						45
					</output>
				</div>
				<div className={styles.end} data-match-end hidden>
					<output data-match-result />
				</div>
				<div className={styles.fade} data-match-fade />
			</div>
		</Html>
	);
}
