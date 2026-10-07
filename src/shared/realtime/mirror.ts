import { type InputCommit, ONLINE, validCommit } from './protocol';

/** A synchronous refresh-safe tail; server ACK is emitted only after storage.put. */
export class CommitMirror {
	persistedSequence = 0;
	private pending = new Map<number, InputCommit>();
	private readonly key: string;
	constructor(readonly matchId: string) {
		this.key = `worms-commits:${matchId}`;
		try {
			const saved: unknown = JSON.parse(sessionStorage.getItem(this.key) ?? '[]');
			if (Array.isArray(saved) && saved.length <= ONLINE.maxHistoryEvents)
				for (const c of saved)
					if (validCommit(c) && c.matchId === matchId) this.pending.set(c.serverSequence, c);
		} catch {}
	}
	retain(commit: InputCommit) {
		if (commit.serverSequence <= this.persistedSequence) return;
		if (this.pending.size >= ONLINE.maxHistoryEvents) throw new Error('RECOVERY_FAILED');
		this.pending.set(commit.serverSequence, commit);
		this.save(true);
	}
	ack(sequence: number) {
		this.persistedSequence = Math.max(this.persistedSequence, sequence);
		for (const n of this.pending.keys()) if (n <= sequence) this.pending.delete(n);
		this.save();
	}
	get tail() {
		return [...this.pending.values()].sort((a, b) => a.serverSequence - b.serverSequence);
	}
	get lastSequence() {
		return Math.max(this.persistedSequence, ...this.pending.keys());
	}
	private save(required = false) {
		try {
			if (this.pending.size) sessionStorage.setItem(this.key, JSON.stringify(this.tail));
			else sessionStorage.removeItem(this.key);
		} catch {
			// A browser must retain its tail before executing it. ACK cleanup can
			// fail harmlessly: a refresh simply resends already persisted commits.
			if (required && typeof window !== 'undefined') throw new Error('RECOVERY_FAILED');
		}
	}
}
