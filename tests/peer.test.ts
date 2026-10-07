import { afterEach, expect, it, vi } from 'vitest';
import { CommitMirror } from '../src/shared/realtime/mirror';
import { PeerLatency, PeerTransport, parsePeerPacket } from '../src/shared/realtime/peer';
import {
	MAX_MESSAGE_BYTES,
	MAX_SIGNAL_BYTES,
	parseClientMessage,
	type SignalMessage,
} from '../src/shared/realtime/protocol';

const id = '00000000-0000-4000-8000-000000000000';
const signal = (value: SignalMessage['signal']): SignalMessage => ({
	type: 'SIGNAL',
	connectionId: id,
	signal: value,
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
it.each(['offer', 'answer'] as const)(
	'accepts %s with its own SDP size budget, without enlarging gameplay',
	(kind) => {
		const m = signal({ kind, sdp: `v=0\r\n${'a'.repeat(2000)}` });
		expect(parseClientMessage(JSON.stringify(m))).toEqual(m);
		expect(MAX_MESSAGE_BYTES).toBe(1024);
		expect(MAX_SIGNAL_BYTES).toBe(16384);
	}
);
it('validates ICE and rejects malformed, oversized and extra signaling fields', () => {
	const ice = signal({
		kind: 'ice',
		candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
	});
	expect(parseClientMessage(JSON.stringify(ice))).toEqual(ice);
	for (const value of [
		{ ...ice, connectionId: 'bad' },
		{ ...ice, from: 'HOST' },
		signal({ kind: 'offer', sdp: 'bad' }),
		signal({ kind: 'offer', sdp: `v=0${'x'.repeat(17000)}` }),
		signal({ kind: 'ice', candidate: { candidate: 'x'.repeat(2049) } }),
		{ ...ice, signal: { kind: 'ice', candidate: { candidate: 'x', sdpMLineIndex: -1 } } },
		{ ...ice, signal: { kind: 'ice', candidate: { candidate: 'x', snapshot: {} } } },
	])
		expect(parseClientMessage(JSON.stringify(value))).toBeNull();
});
it('smooths actual peer RTT and sizes the 60Hz safety buffer from RTT and jitter', () => {
	const p = new PeerLatency();
	p.observe(2);
	expect(p.delayTicks).toBe(2);
	p.observe(4);
	expect(p.rtt).toBeCloseTo(2.6);
	expect(p.jitter).toBeCloseTo(0.5);
	p.observe(60);
	expect(p.delayTicks).toBeGreaterThan(2);
	p.observe(500);
	expect(p.delayTicks).toBe(10);
	p.observe(NaN);
	expect(p.rtt).toBeCloseTo(163.874);
});
function fakePeer() {
	const channel = {
		label: 'worms-input',
		ordered: true,
		maxRetransmits: null,
		maxPacketLifeTime: null,
		readyState: 'open',
		bufferedAmount: 0,
		send: vi.fn(),
		close: vi.fn(),
		onopen: () => {},
		onmessage: (_e: { data: string }) => {},
	};
	const pc = {
		localDescription: { sdp: 'v=0\r\n' },
		remoteDescription: null as unknown,
		connectionState: 'new',
		createDataChannel: vi.fn(() => channel),
		createOffer: vi.fn(async () => ({ type: 'offer' })),
		createAnswer: vi.fn(async () => ({ type: 'answer' })),
		setLocalDescription: vi.fn(async () => {}),
		setRemoteDescription: vi.fn(async (v: unknown) => {
			pc.remoteDescription = v;
		}),
		addIceCandidate: vi.fn(async () => {}),
		close: vi.fn(),
		ondatachannel: (_e: { channel: unknown }) => {},
	};
	return { pc, channel, factory: () => pc as unknown as RTCPeerConnection };
}
it('HOST offers an ordered reliable channel, opens direct transport, and pings the peer', async () => {
	vi.useFakeTimers();
	const f = fakePeer(),
		send = vi.fn(),
		receive = vi.fn(),
		changed = vi.fn();
	const p = new PeerTransport('HOST', send, receive, changed, f.factory);
	await vi.waitFor(() => expect(send).toHaveBeenCalled());
	expect(send.mock.calls[0][0].signal.kind).toBe('offer');
	expect(f.pc.createDataChannel).toHaveBeenCalledWith('worms-input', { ordered: true });
	f.channel.onopen();
	await p.wait();
	expect(p.state).toBe('p2p');
	expect(JSON.parse(f.channel.send.mock.calls[0][0]).type).toBe('PEER_PING');
	p.dispose();
	expect(f.pc.close).toHaveBeenCalled();
});
it('GUEST answers, queues early ICE, then drains candidates after remote description', async () => {
	vi.useFakeTimers();
	const f = fakePeer(),
		send = vi.fn();
	const p = new PeerTransport('GUEST', send, vi.fn(), vi.fn(), f.factory);
	p.accept(signal({ kind: 'ice', candidate: { candidate: 'candidate:1' } }), 'HOST');
	p.accept(signal({ kind: 'offer', sdp: 'v=0' }), 'HOST');
	await vi.waitFor(() => expect(send).toHaveBeenCalled());
	expect(send.mock.calls[0][0].signal.kind).toBe('answer');
	expect(f.pc.addIceCandidate).toHaveBeenCalledWith({ candidate: 'candidate:1' });
	p.dispose();
});
it('bounded negotiation failure settles on websocket fallback and never upgrades late', async () => {
	vi.useFakeTimers();
	const f = fakePeer();
	const p = new PeerTransport('GUEST', vi.fn(), vi.fn(), vi.fn(), f.factory);
	const settled = p.wait();
	await vi.advanceTimersByTimeAsync(8000);
	await settled;
	expect(p.state).toBe('websocket-fallback');
	p.accept(signal({ kind: 'offer', sdp: 'v=0' }), 'HOST');
	expect(f.pc.setRemoteDescription).not.toHaveBeenCalled();
	p.dispose();
});
it('peer progress has strict bounds and rejects unrelated world data', () => {
	expect(
		parsePeerPacket(
			JSON.stringify({
				type: 'PEER_PROGRESS',
				matchId: id,
				tick: 1,
				safeTick: 3,
				turnIndex: 0,
				sequence: 0,
			})
		)
	).not.toBeNull();
	expect(parsePeerPacket('{"type":"WORLD","world":{}}')).toBeNull();
});
it('refresh retains the unacknowledged tail and cumulative persistence ACK removes it', () => {
	const values = new Map<string, string>();
	vi.stubGlobal('sessionStorage', {
		getItem: (k: string) => values.get(k) ?? null,
		setItem: (k: string, v: string) => values.set(k, v),
		removeItem: (k: string) => values.delete(k),
	});
	const m = new CommitMirror(id),
		c = {
			type: 'INPUT_COMMIT' as const,
			matchId: id,
			serverSequence: 1,
			effectiveTick: 2,
			seat: 'HOST' as const,
			turnIndex: 0,
			change: { commands: [] },
		};
	m.retain(c);
	expect(new CommitMirror(id).tail).toEqual([c]);
	m.ack(1);
	expect(m.persistedSequence).toBe(1);
	expect(new CommitMirror(id).tail).toEqual([]);
});
it('a blocked browser recovery store fails before an unpersisted input can execute', () => {
	vi.stubGlobal('window', {});
	vi.stubGlobal('sessionStorage', {
		getItem: () => null,
		setItem: () => {
			throw new Error('quota');
		},
	});
	const m = new CommitMirror(id);
	expect(() =>
		m.retain({
			type: 'INPUT_COMMIT',
			matchId: id,
			serverSequence: 1,
			effectiveTick: 2,
			seat: 'HOST',
			turnIndex: 0,
			change: { commands: [] },
		})
	).toThrow('RECOVERY_FAILED');
});
