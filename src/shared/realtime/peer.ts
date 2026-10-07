import {
	type InputCommit,
	MAX_MESSAGE_BYTES,
	ONLINE,
	type PeerProgress,
	type Seat,
	type SignalMessage,
	validCommit,
	validPeerProgress,
	validTick,
} from './protocol';

export class PeerLatency {
	rtt?: number;
	jitter = 0;
	observe(sample: number) {
		if (!Number.isFinite(sample) || sample < 0 || sample > ONLINE.peerTimeoutMs) return;
		if (this.rtt === undefined) this.rtt = sample;
		else {
			this.jitter = this.jitter * 0.75 + Math.abs(sample - this.rtt) * 0.25;
			this.rtt = this.rtt * 0.7 + sample * 0.3;
		}
	}
	get delayTicks() {
		// Half RTT estimates delivery; two jitter deviations plus one fixed tick
		// cover frame dispatch. Ordered progress watermarks prevent late input.
		return Math.min(
			10,
			Math.max(1, Math.ceil(((this.rtt ?? 16) / 2 + 2 * this.jitter) / (1000 / 60)) + 1)
		);
	}
}
export type PeerMessage =
	| InputCommit
	| PeerProgress
	| { type: 'PEER_PING' | 'PEER_PONG'; id: number };
export function parsePeerPacket(raw: string): PeerMessage | null {
	if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return null;
	try {
		const m = JSON.parse(raw);
		if (validCommit(m)) return m;
		if (!m || typeof m !== 'object') return null;
		if (m.type === 'PEER_PING' || m.type === 'PEER_PONG')
			return Object.keys(m).length === 2 && validTick(m.id) ? m : null;
		return validPeerProgress(m) ? m : null;
	} catch {
		return null;
	}
}

/** One room connection, replaced after every reconnect; no TURN dependency. */
export class PeerTransport {
	state: 'connecting' | 'p2p' | 'websocket-fallback' = 'connecting';
	readonly latency = new PeerLatency();
	private pc?: RTCPeerConnection;
	private channel?: RTCDataChannel;
	private connectionId?: string;
	private candidates: RTCIceCandidateInit[] = [];
	private earlyCandidates = new Map<string, RTCIceCandidateInit[]>();
	private timer?: ReturnType<typeof setTimeout>;
	private pingTimer?: ReturnType<typeof setInterval>;
	private pending?: { id: number; at: number };
	private pingId = 0;
	private disposed = false;
	private chain = Promise.resolve();
	private settled: (() => void)[] = [];
	constructor(
		readonly seat: Seat,
		private readonly signal: (message: SignalMessage) => void,
		private readonly receive: (message: PeerMessage) => void,
		private readonly changed: () => void,
		private readonly factory = () =>
			new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] })
	) {
		this.timer = setTimeout(() => this.fallback(), ONLINE.connectTimeoutMs);
		if (seat === 'HOST') void this.offer();
	}
	wait() {
		return this.state !== 'connecting'
			? Promise.resolve()
			: new Promise<void>((resolve) => this.settled.push(resolve));
	}
	private notify() {
		for (const resolve of this.settled.splice(0)) resolve();
		this.changed();
	}
	private create(id: string) {
		this.connectionId = id;
		const pc = this.factory();
		this.pc = pc;
		pc.onicecandidate = (e) => {
			if (e.candidate && !this.disposed && this.state !== 'websocket-fallback')
				this.signal({
					type: 'SIGNAL',
					connectionId: id,
					signal: { kind: 'ice', candidate: e.candidate.toJSON() },
				});
		};
		pc.onconnectionstatechange = () => {
			if (
				pc.connectionState === 'failed' ||
				pc.connectionState === 'disconnected' ||
				pc.connectionState === 'closed'
			)
				this.fallback();
		};
		pc.ondatachannel = (e) => {
			if (
				this.seat !== 'GUEST' ||
				this.channel ||
				e.channel.label !== 'worms-input' ||
				!e.channel.ordered ||
				e.channel.maxRetransmits !== null ||
				e.channel.maxPacketLifeTime !== null
			) {
				e.channel.close();
				return;
			}
			this.bind(e.channel);
		};
		return pc;
	}
	private async offer() {
		try {
			const id = crypto.randomUUID(),
				pc = this.create(id);
			this.bind(pc.createDataChannel('worms-input', { ordered: true }));
			await pc.setLocalDescription(await pc.createOffer());
			if (!this.disposed && this.state === 'connecting')
				this.signal({
					type: 'SIGNAL',
					connectionId: id,
					signal: { kind: 'offer', sdp: pc.localDescription?.sdp ?? '' },
				});
		} catch {
			this.fallback();
		}
	}
	accept(m: SignalMessage, from: Seat) {
		if (from === this.seat || this.disposed || this.state === 'websocket-fallback') return;
		this.chain = this.chain
			.then(async () => {
				if (this.disposed || this.state === 'websocket-fallback') return;
				if (m.signal.kind === 'offer') {
					if (this.seat !== 'GUEST' || this.pc) return;
					const pc = this.create(m.connectionId);
					this.candidates.push(...(this.earlyCandidates.get(m.connectionId) ?? []));
					this.earlyCandidates.clear();
					await pc.setRemoteDescription({ type: 'offer', sdp: m.signal.sdp });
					await pc.setLocalDescription(await pc.createAnswer());
					if (!this.disposed)
						this.signal({
							type: 'SIGNAL',
							connectionId: m.connectionId,
							signal: { kind: 'answer', sdp: pc.localDescription?.sdp ?? '' },
						});
				} else if (!this.pc && this.seat === 'GUEST' && m.signal.kind === 'ice') {
					if (this.earlyCandidates.size < 4) {
						const list = this.earlyCandidates.get(m.connectionId) ?? [];
						if (list.length < 64) list.push(m.signal.candidate);
						this.earlyCandidates.set(m.connectionId, list);
					}
				} else if (m.connectionId === this.connectionId && this.pc) {
					if (m.signal.kind === 'answer' && this.seat === 'HOST' && !this.pc.remoteDescription)
						await this.pc.setRemoteDescription({ type: 'answer', sdp: m.signal.sdp });
					else if (m.signal.kind === 'ice') {
						if (this.pc.remoteDescription) await this.pc.addIceCandidate(m.signal.candidate);
						else if (this.candidates.length < 64) this.candidates.push(m.signal.candidate);
					}
				}
				if (this.pc?.remoteDescription)
					for (const c of this.candidates.splice(0)) await this.pc.addIceCandidate(c);
			})
			.catch(() => this.fallback());
	}
	private bind(channel: RTCDataChannel) {
		this.channel = channel;
		channel.onopen = () => {
			if (this.disposed || this.state !== 'connecting') return;
			clearTimeout(this.timer);
			this.state = 'p2p';
			const ping = () => {
				if (this.pending && performance.now() - this.pending.at > ONLINE.peerTimeoutMs) {
					this.fallback();
					return;
				}
				if (this.pending) return;
				this.pending = { id: ++this.pingId % 1000000, at: performance.now() };
				this.send({ type: 'PEER_PING', id: this.pending.id });
			};
			ping();
			this.pingTimer = setInterval(ping, 500);
			this.notify();
		};
		channel.onclose = channel.onerror = () => this.fallback();
		channel.onmessage = (e) => {
			const m = typeof e.data === 'string' ? parsePeerPacket(e.data) : null;
			if (!m || this.disposed) {
				this.fallback();
				return;
			}
			if (m.type === 'PEER_PING') this.send({ type: 'PEER_PONG', id: m.id });
			else if (m.type === 'PEER_PONG') {
				if (m.id === this.pending?.id) {
					this.latency.observe(performance.now() - this.pending.at);
					this.pending = undefined;
					this.changed();
				}
			} else this.receive(m);
		};
	}
	send(m: PeerMessage) {
		if (this.state !== 'p2p' || this.channel?.readyState !== 'open') return false;
		try {
			if (this.channel.bufferedAmount > 65536) {
				this.fallback();
				return false;
			}
			this.channel.send(JSON.stringify(m));
			return true;
		} catch {
			this.fallback();
			return false;
		}
	}
	fallback() {
		if (this.disposed || this.state === 'websocket-fallback') return;
		this.state = 'websocket-fallback';
		clearTimeout(this.timer);
		clearInterval(this.pingTimer);
		this.pc?.close();
		this.notify();
	}
	dispose() {
		this.disposed = true;
		clearTimeout(this.timer);
		clearInterval(this.pingTimer);
		this.pc?.close();
		for (const resolve of this.settled.splice(0)) resolve();
	}
}
