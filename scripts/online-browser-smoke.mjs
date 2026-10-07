import assert from 'node:assert/strict';

/** Run via Playwright CLI run-code with its page; no application-only test hook. */
export default async function onlineBrowserSmoke(page, base = 'http://127.0.0.1:3002/worms-js/') {
	const browser = page.context().browser();
	const contexts = [];
	const results = {};
	async function context(forceFallback = false) {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		contexts.push(ctx);
		await ctx.addInitScript((blocked) => {
			window.networkTrace = [];
			const NativeSocket = window.WebSocket;
			window.WebSocket = class extends NativeSocket {
				send(raw) {
					const m = JSON.parse(raw);
					if (m.type === 'MATCH_FAIL') window.networkTrace.push(m);
					super.send(raw);
				}
				constructor(...args) {
					super(...args);
					this.addEventListener('message', (e) => {
						const m = JSON.parse(e.data);
						if (
							[
								'MATCH_GO',
								'RECOVERY_GO',
								'RECOVERY_BEGIN',
								'RECOVERY_FLUSH',
								'CHECKPOINT_OK',
								'MATCH_STOP',
								'ERROR',
							].includes(m.type)
						)
							window.networkTrace.push(m);
					});
				}
			};
			if (blocked)
				window.RTCPeerConnection = class {
					constructor() {
						throw new Error('Controlled QA ICE failure');
					}
				};
		}, forceFallback);
		return ctx.newPage();
	}
	async function snapshot(p) {
		return p.locator('[data-online]').evaluate((el) => ({
			online: JSON.parse(el.dataset.online),
			match: JSON.parse(el.dataset.match),
			worms: JSON.parse(el.dataset.worms),
			weapon: JSON.parse(el.dataset.weapon),
			result: JSON.parse(el.dataset.result ?? 'null'),
			projectiles: JSON.parse(el.dataset.projectiles),
		}));
	}
	async function wait(p, predicate, timeout = 30000) {
		const end = Date.now() + timeout;
		while (Date.now() < end) {
			if (await p.locator('[data-online]').count()) {
				const s = await snapshot(p);
				assert.equal(s.online.error, undefined, JSON.stringify(s.online));
				if (predicate(s)) return s;
			}
			await p.waitForTimeout(50);
		}
		throw new Error(`Timed out: ${await p.locator('body').innerText()}`);
	}
	async function create(host, roster = 1) {
		await host.goto(base);
		await host.getByRole('button', { name: 'Новая игра' }).click();
		await host
			.getByRole('radio', { name: roster === 1 ? 'Дуэль 1vs1' : 'Полный состав 3vs3' })
			.click();
		await host.getByRole('radio', { name: 'Онлайн игра Игра по сети с другом' }).click();
		await host.getByRole('button', { name: 'Начать игру', exact: true }).click();
		await host.waitForURL('**/*room=*');
		return host.url();
	}
	async function start(host, guest, invite) {
		await guest.goto(invite);
		await host.getByRole('button', { name: 'Начать матч', exact: true }).click();
		return Promise.all(
			[host, guest].map((p) => wait(p, (s) => s.online.checkpoint === 'OK' && s.online.tick > 30))
		);
	}
	async function hold(p, key, ms) {
		await p.keyboard.down(key);
		await p.waitForTimeout(ms);
		await p.keyboard.up(key);
	}
	async function shoot(p, weapon, turnIndex) {
		await wait(
			p,
			(s) => s.match.turnIndex === turnIndex && s.match.turnState === 'CONTROL' && !s.online.status
		);
		await hold(p, 'ArrowRight', 200);
		await hold(p, 'ArrowDown', 1000);
		await p.keyboard.press(weapon === 'bazooka' ? 'F1' : 'F2');
		if (weapon === 'grenade') await p.keyboard.press('1');
		await p.waitForTimeout(350);
		await hold(p, 'Space', 120);
		const launched = await wait(
			p,
			(s) => s.projectiles.some((v) => v.type === weapon) || s.result !== null,
			5000
		);
		const changed = await wait(
			p,
			(s) => s.match.turnIndex > turnIndex && s.online.checkpoint === 'OK',
			30000
		);
		return {
			launch: launched.online,
			checkpoint: changed.online,
			hp: changed.worms.map((w) => w.hp),
			result: changed.result,
		};
	}
	async function refresh(p, other, expectedTransport = 'p2p') {
		const before = (await snapshot(p)).online;
		await p.reload();
		await wait(
			p,
			(s) =>
				s.online.recoveryProgress === 100 &&
				!s.online.status &&
				s.online.transport === expectedTransport
		);
		await wait(
			other,
			(s) =>
				s.online.recoveryProgress === 100 &&
				!s.online.status &&
				s.online.transport === expectedTransport
		);
		const restored = await Promise.all([p, other].map(snapshot));
		assert.equal(restored[0].online.hash, restored[1].online.hash);
		assert.ok(restored[0].online.lastSequence >= before.lastSequence);
		return restored.map((s) => s.online);
	}
	try {
		results.stage = 'create direct pair';
		await page.goto('about:blank');
		const host = await context(),
			guest = await context();
		const invite = await create(host, 3);
		const initial = await start(host, guest, invite);
		for (const s of initial) assert.equal(s.online.transport, 'p2p');
		await host.waitForTimeout(2000);
		results.latency = (await Promise.all([host, guest].map(snapshot))).map((s) => s.online);
		results.stage = 'HOST bazooka';
		results.bazooka = await shoot(host, 'bazooka', 0);
		results.stage = 'HOST refresh';
		results.hostRefresh = await refresh(host, guest);
		results.stage = 'GUEST grenade';
		results.grenade = await shoot(guest, 'grenade', 1);
		results.stage = 'GUEST refresh';
		results.guestRefresh = await refresh(guest, host);
		results.stage = 'two simultaneous rooms';
		const host2 = await context(),
			guest2 = await context();
		const invite2 = await create(host2),
			room2 = await start(host2, guest2, invite2);
		assert.notEqual(room2[0].online.matchId, results.latency[0].matchId);
		results.duelLatency = room2.map((s) => s.online);
		const sequences = room2.map((s) => s.online.lastSequence);
		await hold(host, 'ArrowRight', 120);
		await host.waitForTimeout(500);
		const isolated = await Promise.all([host2, guest2].map(snapshot));
		assert.deepEqual(
			isolated.map((s) => s.online.lastSequence),
			sequences
		);
		results.roomsIsolated = true;
		const full = await host2.evaluate(async () => {
			const room = new URL(location.href).searchParams.get('room');
			const local = ['localhost', '127.0.0.1'].includes(location.hostname);
			const r = await fetch(
				`${local ? 'http://127.0.0.1:8787' : 'https://worms-js-realtime.godfrey-namco.workers.dev'}/rooms/${room}/join`,
				{ method: 'POST' }
			);
			return { status: r.status, body: await r.json() };
		});
		assert.equal(full.body.error.code, 'MATCH_ALREADY_STARTED');
		results.thirdSeatRejected = full;
		await host2.context().close();
		await guest2.context().close();
		const fallbackHost = await context(true),
			fallbackGuest = await context(true);
		const fallbackInvite = await create(fallbackHost, 3);
		results.stage = 'fallback initial establishment';
		const fallback = await start(fallbackHost, fallbackGuest, fallbackInvite);
		for (const s of fallback) assert.equal(s.online.transport, 'websocket-fallback');
		results.fallback = await shoot(fallbackHost, 'bazooka', 0);
		results.stage = 'fallback on recovery';
		await host.context().addInitScript(() => {
			window.RTCPeerConnection = class {
				constructor() {
					throw new Error('Controlled QA reconnect failure');
				}
			};
		});
		await guest.evaluate(() => {
			window.RTCPeerConnection = class {
				constructor() {
					throw new Error('Controlled QA reconnect failure');
				}
			};
		});
		results.recoveryFallback = await refresh(host, guest, 'websocket-fallback');
		results.traces = await Promise.all(
			[host, guest, fallbackHost, fallbackGuest].map((p) => p.evaluate(() => window.networkTrace))
		);
		for (const trace of results.traces)
			assert.ok(
				!trace.some((m) => m.type === 'ERROR' || m.type === 'MATCH_STOP'),
				JSON.stringify(trace)
			);
		delete results.stage;
		return results;
	} catch (error) {
		const pages = contexts.flatMap((ctx) => ctx.pages());
		const state = await Promise.all(
			pages.map(async (p) => ({
				url: p.url(),
				body: (await p.locator('body').innerText()).slice(-1200),
				trace: await p.evaluate(() => window.networkTrace),
			}))
		);
		throw new Error(`${results.stage}: ${error.message}\n${JSON.stringify({ results, state })}`);
	} finally {
		for (const ctx of contexts) await ctx.close().catch(() => {});
	}
}
