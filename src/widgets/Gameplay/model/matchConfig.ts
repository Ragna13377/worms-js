import type { MatchConfig } from '../../../entities/Match/model/match';
/** Browser-only adapter: the match domain accepts validated explicit configuration. */
export function matchConfigFromQuery(query: string): MatchConfig {
	const params = new URLSearchParams(query);
	const count = (name: string) => {
		const raw = params.get(name);
		if (raw === null || !raw.trim()) return 3;
		const value = Number(raw);
		return Number.isInteger(value) ? Math.max(1, Math.min(3, value)) : 3;
	};
	return { RED: count('red'), BLUE: count('blue') };
}
