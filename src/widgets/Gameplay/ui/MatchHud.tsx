import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { teamCurrentHp, teamMaxHp } from '../../../entities/Match/model/match';
import type { Game } from '../model/simulation';
import styles from './MatchHud.module.css';

export function MatchHud({ game, onRestart }: { game: Game; onRestart: () => void }) {
	const root = useRef<HTMLDivElement>(null);
	useFrame(() => {
		const element = root.current;
		if (!element) return;
		const match = game.match,
			active = game.worms.find((w) => w.id === match.activeWormId);
		const timer = element.querySelector<HTMLOutputElement>('[data-turn-timer]');
		if (timer) timer.textContent = String(Math.ceil(match.turnTimeRemaining));
		const clock = element.querySelector<HTMLOutputElement>('[data-match-timer]');
		const remaining = Math.ceil(match.matchTimeRemaining);
		if (clock)
			clock.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
		const turn = element.querySelector<HTMLOutputElement>('[data-turn-identity]');
		if (turn) {
			turn.textContent = active ? `${match.config.teamNames[active.team]} · ${active.name}` : '';
			turn.style.color = active?.team === 'RED' ? '#f58b84' : '#8fb8ff';
		}
		for (const team of ['RED', 'BLUE'] as const) {
			const hp = teamCurrentHp(game.worms, team),
				max = teamMaxHp(match, team);
			const bar = element.querySelector<HTMLDivElement>(`[data-team-bar="${team}"]`);
			if (bar) {
				bar.style.width = `${max ? (hp / max) * 100 : 0}%`;
				bar.parentElement?.setAttribute('aria-valuenow', String(hp));
			}
			const text = element.querySelector<HTMLOutputElement>(`[data-team-total="${team}"]`);
			if (text) text.textContent = `${hp} / ${max}`;
		}
		const end = element.querySelector<HTMLDivElement>('[data-match-end]');
		if (end) end.hidden = match.turnState !== 'MATCH_END';
		const result = element.querySelector<HTMLOutputElement>('[data-match-result]');
		if (result)
			result.textContent =
				match.result === 'DRAW'
					? 'Ничья'
					: match.result
						? `${match.config.teamNames[match.result]} — победа!`
						: '';
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
					{(['RED', 'BLUE'] as const).map((team) => (
						<div
							key={team}
							className={styles.team}
							style={{ color: team === 'RED' ? '#f58b84' : '#8fb8ff' }}
						>
							<span className={styles.name}>{game.match.config.teamNames[team]}</span>
							<div
								className={styles.track}
								role='progressbar'
								aria-label={`${team} HP`}
								aria-valuemin={0}
								aria-valuemax={teamMaxHp(game.match, team)}
								aria-valuenow={teamMaxHp(game.match, team)}
							>
								<div className={styles.bar} data-team-bar={team} />
							</div>
							<output data-team-total={team} />
						</div>
					))}
				</div>
				<div className={styles.turn}>
					<output data-turn-identity />
					<output className={styles.timer} data-turn-timer aria-label='Turn seconds'>
						45
					</output>
					<output data-match-timer aria-label='Match time'>
						10:00
					</output>
				</div>
				<div className={styles.end} data-match-end hidden>
					<output data-match-result />
					<button type='button' onClick={onRestart}>
						Заново · R
					</button>
				</div>
			</div>
		</Html>
	);
}
