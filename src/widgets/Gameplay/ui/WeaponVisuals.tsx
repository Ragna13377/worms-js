import { WEAPON } from '@entities/Weapon/model/config';
import { equipmentProgress } from '@entities/Weapon/model/presentation';
import { aimDirection } from '@entities/Weapon/model/weapon';
import { WORM } from '@entities/Worm/model/config';
import { Html } from '@react-three/drei';
import { useFrame, useLoader } from '@react-three/fiber';
import smokeArt from '@src/assets/props/Effects/skdsmoke.png';
import arrow from '@src/assets/props/Misc/arrowdnr.png';
import reticle from '@src/assets/props/Misc/crshairr.png';
import grenade from '@src/assets/props/Weapons/grenade.png';
import missile from '@src/assets/props/Weapons/missile.png';
import { useMemo, useRef } from 'react';
import {
	Color,
	type Group,
	type Mesh,
	type MeshBasicMaterial,
	NearestFilter,
	type ShaderMaterial,
	TextureLoader,
} from 'three';
import { activeWorm, type Game } from '../model/simulation';

const powerFragment = `uniform float uDiameter; uniform vec3 uColor; varying vec2 vUv;
void main(){vec2 p=(floor(vUv*uDiameter)+0.5)/uDiameter-0.5;if(length(p)>0.5)discard;gl_FragColor=vec4(uColor,0.88);}`;
const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader = `uniform float uOpacity; uniform sampler2D uMap; uniform float uFrame; uniform float uFrames; varying vec2 vUv;
void main(){vec4 c=texture2D(uMap,vec2(vUv.x,(vUv.y+uFrames-1.0-uFrame)/uFrames));if(distance(c.rgb,vec3(128.,128.,192.)/255.)<0.01 || distance(c.rgb,vec3(192.,192.,128.)/255.)<0.01)discard;gl_FragColor=vec4(c.rgb,c.a*uOpacity);}`;
/** Fixed meshes, mutable presentation only; no projectile position in React state. */
export function WeaponVisuals({
	game,
	presentation,
}: {
	game: Game;
	presentation: { interpolationAlpha: number };
}) {
	const projectile = useRef<Mesh>(null),
		crosshair = useRef<Mesh>(null);
	const shotMaterial = useRef<ShaderMaterial>(null),
		aimMaterial = useRef<ShaderMaterial>(null);
	const countdownGroup = useRef<Group>(null);
	const countdown = useRef<HTMLOutputElement>(null);
	const dots = useRef<Group>(null),
		effects = useRef<Group>(null);
	const marker = useRef<Mesh>(null);
	const markerMaterial = useRef<ShaderMaterial>(null);
	const smoke = useRef<Group>(null);
	const trail = useRef<{ x: number; y: number; born: number }[]>([]);
	const trailShot = useRef<number | null>(null);
	const trailTime = useRef(0);
	const textures = useLoader(TextureLoader, [
		missile.src,
		grenade.src,
		reticle.src,
		arrow.src,
		smokeArt.src,
	]);
	useMemo(() => {
		for (const texture of textures) {
			texture.magFilter = texture.minFilter = NearestFilter;
			texture.generateMipmaps = false;
		}
	}, [textures]);
	const shotUniforms = useMemo(
		() => ({
			uOpacity: { value: 1 },
			uMap: { value: textures[0] },
			uFrame: { value: 0 },
			uFrames: { value: missile.height / 60 },
		}),
		[textures]
	);
	const aimUniforms = useMemo(
		() => ({
			uOpacity: { value: 1 },
			uMap: { value: textures[2] },
			uFrame: { value: 0 },
			uFrames: { value: reticle.height / 60 },
		}),
		[textures]
	);
	const markerUniforms = useMemo(
		() => ({
			uOpacity: { value: 1 },
			uMap: { value: textures[3] },
			uFrame: { value: 0 },
			uFrames: { value: arrow.height / 60 },
		}),
		[textures]
	);
	const smokeUniforms = useMemo(
		() =>
			Array.from({ length: 48 }, () => ({
				uOpacity: { value: 1 },
				uMap: { value: textures[4] },
				uFrame: { value: 8 },
				uFrames: { value: smokeArt.height / 60 },
			})),
		[textures]
	);
	useFrame(() => {
		const p = game.projectiles[0];
		if (trailShot.current !== (p?.id ?? null)) {
			trailShot.current = p?.id ?? null;
			trailTime.current = -1;
		}
		if (
			p?.type === 'bazooka' &&
			game.time - trailTime.current >= 0.012 + Math.min(0.04, p.age * 0.025)
		) {
			trail.current.push({ x: p.position.x, y: p.position.y, born: game.time });
			trailTime.current = game.time;
		}
		trail.current = trail.current.filter((t) => game.time - t.born < 1.5).slice(-48);
		if (smoke.current)
			for (const [i, child] of smoke.current.children.entries()) {
				const t = trail.current[i],
					mesh = child as Mesh;
				mesh.visible = Boolean(t);
				if (t) {
					const age = game.time - t.born;
					mesh.position.set(t.x, t.y, 8);
					mesh.scale.setScalar(1);
					const mat = mesh.material as ShaderMaterial;
					mat.uniforms.uFrame.value = Math.min(63, Math.floor(18 + (age / 1.5) * 45));
					mat.uniforms.uOpacity.value = Math.max(0, 1 - age / 1.5);
				}
			}
		if (countdownGroup.current) {
			countdownGroup.current.visible = p?.type === 'grenade';
			if (p) {
				const a = presentation.interpolationAlpha;
				countdownGroup.current.position.set(
					p.previousPosition.x + (p.position.x - p.previousPosition.x) * a,
					p.previousPosition.y + (p.position.y - p.previousPosition.y) * a + 20,
					10
				);
			}
		}
		if (countdown.current) {
			countdown.current.style.display = p?.type === 'grenade' ? 'block' : 'none';
			countdown.current.textContent = p ? `${Math.max(0, p.fuse - p.age).toFixed(1)} s` : '';
		}
		if (projectile.current && shotMaterial.current) {
			projectile.current.visible = Boolean(p);
			if (p) {
				const a = presentation.interpolationAlpha;
				projectile.current.position.set(
					p.previousPosition.x + (p.position.x - p.previousPosition.x) * a,
					p.previousPosition.y + (p.position.y - p.previousPosition.y) * a,
					9
				);
				projectile.current.scale.setScalar(p.type === 'bazooka' ? 0.85 : 0.8);
				const image = p.type === 'bazooka' ? missile : grenade;
				shotMaterial.current.uniforms.uMap.value = textures[p.type === 'bazooka' ? 0 : 1];
				shotMaterial.current.uniforms.uFrames.value = image.height / 60;
				shotMaterial.current.uniforms.uFrame.value =
					p.type === 'grenade' ? Math.floor(p.age * 16) % (image.height / 60) : 0;
				// The missile's first frame points up; rotate the art into actual velocity.
				projectile.current.rotation.z =
					p.type === 'bazooka' ? Math.atan2(p.velocity.y, p.velocity.x) - Math.PI / 2 : 0;
			}
		}
		const worm = activeWorm(game);
		const ready = Boolean(worm && equipmentProgress(worm, game.weapon) >= 1 && !p);
		if (marker.current && markerMaterial.current) {
			marker.current.visible = Boolean(worm && game.turnMarker && !p && !game.weapon.isCharging);
			if (worm) marker.current.position.set(worm.position.x, worm.position.y + 90, 10);
			markerMaterial.current.uniforms.uFrame.value =
				Math.floor(game.time * 14) % (arrow.height / 60);
		}
		if (crosshair.current && aimMaterial.current) {
			crosshair.current.visible = ready;
			if (worm) {
				const d = aimDirection(worm, game.weapon.aimAngle);
				const a = presentation.interpolationAlpha;
				const x = worm.previousPosition.x + (worm.position.x - worm.previousPosition.x) * a;
				const y = worm.previousPosition.y + (worm.position.y - worm.previousPosition.y) * a;
				crosshair.current.position.set(
					x + d.x * WEAPON.reticleDistance,
					y + d.y * WEAPON.reticleDistance,
					10
				);
				aimMaterial.current.uniforms.uFrame.value =
					Math.floor(game.time * 16) % (reticle.height / 60);
				if (dots.current)
					for (const [i, child] of dots.current.children.entries()) {
						const mesh = child as Mesh;
						mesh.visible =
							game.weapon.isCharging && ready && i < Math.ceil(game.weapon.charge * 13);
						mesh.position.set(x + d.x * (12 + i * 2.5 + i * i * 0.2), y + d.y * (15 + i * 5), 10);
					}
			}
		}
		if (dots.current && !worm) dots.current.visible = false;
		else if (dots.current) dots.current.visible = true;
		if (effects.current)
			for (const [i, child] of effects.current.children.entries()) {
				const fx = game.explosions.effects[i],
					mesh = child as Mesh;
				mesh.visible = Boolean(fx);
				if (fx) {
					const t = fx.age / WEAPON.fxDuration;
					mesh.position.set(fx.position.x, fx.position.y, 11);
					mesh.scale.setScalar(fx.radius * (0.1 + t * 0.8));
					const mat = mesh.material as MeshBasicMaterial;
					mat.opacity = (1 - t) * 0.85;
					mat.color.set(t < 0.25 ? '#fff6b0' : t < 0.55 ? '#ffab24' : '#df4724');
				}
			}
	});
	return (
		<>
			<mesh ref={marker} visible={false}>
				<planeGeometry args={[60, 60]} />
				<shaderMaterial
					ref={markerMaterial}
					uniforms={markerUniforms}
					vertexShader={vertexShader}
					fragmentShader={fragmentShader}
					transparent
					depthWrite={false}
					depthTest={false}
				/>
			</mesh>
			<group ref={smoke}>
				{smokeUniforms.map((uniforms, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Stable smoke pool.
					<mesh key={i} visible={false}>
						<planeGeometry args={[60, 60]} />
						<shaderMaterial
							uniforms={uniforms}
							vertexShader={vertexShader}
							fragmentShader={fragmentShader}
							transparent
							depthWrite={false}
						/>
					</mesh>
				))}
			</group>
			<mesh ref={projectile} visible={false}>
				<planeGeometry args={[60, 60]} />
				<shaderMaterial
					ref={shotMaterial}
					uniforms={shotUniforms}
					vertexShader={vertexShader}
					fragmentShader={fragmentShader}
					transparent
					depthWrite={false}
					toneMapped={false}
				/>
			</mesh>
			<mesh ref={crosshair} visible={false}>
				<planeGeometry args={[42, 42]} />
				<shaderMaterial
					ref={aimMaterial}
					uniforms={aimUniforms}
					vertexShader={vertexShader}
					fragmentShader={fragmentShader}
					transparent
					depthTest={false}
					depthWrite={false}
					toneMapped={false}
				/>
			</mesh>
			<group ref={countdownGroup}>
				<Html center zIndexRange={[24, 24]} style={{ pointerEvents: 'none' }}>
					<output
						ref={countdown}
						aria-label='Projectile fuse'
						style={{
							display: 'none',
							background: '#161a25',
							color: '#ffef84',
							padding: '2px 4px',
							border: '1px solid #ddc067',
							font: 'bold 12px monospace',
							whiteSpace: 'nowrap',
						}}
					/>
				</Html>
			</group>
			<group ref={dots}>
				{Array.from({ length: 13 }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Fixed presentation pool slots never reorder.
					<mesh key={i} visible={false}>
						<planeGeometry args={[5 + i * 0.8, 5 + i * 0.8]} />
						<shaderMaterial
							vertexShader={vertexShader}
							fragmentShader={powerFragment}
							uniforms={{
								uDiameter: { value: 5 + i * 0.8 },
								uColor: {
									value: new Color().setRGB(1, 0.15 + (i / 12) * 0.65, 0.06 + (i / 12) * 0.17),
								},
							}}
							transparent
							depthTest={false}
							depthWrite={false}
						/>
					</mesh>
				))}
			</group>
			<group ref={effects}>
				{Array.from(
					{ length: game.worms.length + Math.ceil(WEAPON.fxDuration / WORM.fixedStep) },
					(_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Fixed presentation pool slots never reorder.
						<mesh key={i} visible={false}>
							<circleGeometry args={[1, 32]} />
							<meshBasicMaterial transparent depthTest={false} depthWrite={false} />
						</mesh>
					)
				)}
			</group>
		</>
	);
}
