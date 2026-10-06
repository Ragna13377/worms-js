import { WEAPON } from '@entities/Weapon/model/config';
import { equipmentProgress, powerDotProgress } from '@entities/Weapon/model/presentation';
import { aimDirection } from '@entities/Weapon/model/weapon';
import { WORM } from '@entities/Worm/model/config';
import { Html } from '@react-three/drei';
import { useFrame, useLoader } from '@react-three/fiber';
import smokeArt from '@src/assets/props/Effects/hexhaust.png';
import arrow from '@src/assets/props/Misc/arrowdnr.png';
import reticle from '@src/assets/props/Misc/crshairr.png';
import grenade from '@src/assets/props/Weapons/grenade.png';
import missile from '@src/assets/props/Weapons/missile.png';
import { useMemo, useRef, useState } from 'react';
import {
	Color,
	type Group,
	type Mesh,
	type MeshBasicMaterial,
	NearestFilter,
	type ShaderMaterial,
	TextureLoader,
} from 'three';
import { WormsVectorText } from '../../../shared/ui/WormsVectorText';
import {
	createRocketBubbles,
	ROCKET_BUBBLE_LIMIT,
	updateRocketBubbles,
} from '../model/rocketBubbles';
import {
	createRocketTrail,
	rocketTrailSample,
	TRAIL_LIMIT,
	trailInterval,
	updateRocketTrail,
} from '../model/rocketTrail';
import { activeWorm, type Game } from '../model/simulation';
import { canControlWorm } from '../model/turns';
import { ExplosionVisuals } from './ExplosionVisuals';

const powerFragment = `uniform float uOpacity; uniform float uDiameter; uniform vec3 uColor; varying vec2 vUv;
void main(){vec2 p=(floor(vUv*uDiameter)+0.5)/uDiameter-0.5;if(length(p)>0.5)discard;gl_FragColor=vec4(uColor,uOpacity);}`;
const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader = `uniform float uOpacity; uniform sampler2D uMap; uniform float uFrame; uniform float uFrames; varying vec2 vUv;
void main(){vec4 c=texture2D(uMap,vec2(vUv.x,(vUv.y+uFrames-1.0-uFrame)/uFrames));if(distance(c.rgb,vec3(128.,128.,192.)/255.)<0.01 || distance(c.rgb,vec3(192.,192.,128.)/255.)<0.01)discard;gl_FragColor=vec4(c.rgb,c.a*uOpacity);}`;
const underwaterFragment = fragmentShader
	.replace('uniform float uOpacity;', 'uniform float uOpacity; uniform float uWaterTint;')
	.replace(
		'vec4(c.rgb,c.a*uOpacity)',
		'vec4(mix(c.rgb,vec3(0.28,0.34,0.6),uWaterTint),c.a*uOpacity)'
	);
/** Fixed meshes, mutable presentation only; no projectile position in React state. */
export function WeaponVisuals({
	game,
	presentation,
	waterLevel,
}: {
	game: Game;
	waterLevel: number;
	presentation: { interpolationAlpha: number };
}) {
	const projectile = useRef<Mesh>(null),
		crosshair = useRef<Mesh>(null);
	const shotMaterial = useRef<ShaderMaterial>(null),
		aimMaterial = useRef<ShaderMaterial>(null);
	const countdownGroup = useRef<Group>(null);
	const countdown = useRef<HTMLOutputElement>(null);
	const [countdownValue, setCountdownValue] = useState(3);
	const dots = useRef<Group>(null);
	const marker = useRef<Mesh>(null);
	const markerMaterial = useRef<ShaderMaterial>(null);
	const smoke = useRef<Group>(null);
	const trail = useRef(createRocketTrail());
	const bubbles = useRef(createRocketBubbles());
	const bubbleGroup = useRef<Group>(null);
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
			uWaterTint: { value: 0 },
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
			Array.from({ length: TRAIL_LIMIT }, () => ({
				uOpacity: { value: 1 },
				uMap: { value: textures[4] },
				uFrame: { value: 8 },
				uFrames: { value: smokeArt.height / smokeArt.width },
			})),
		[textures]
	);
	useFrame(() => {
		const p = game.projectiles[0];
		const sample = p ? rocketTrailSample(p, presentation.interpolationAlpha, game.time) : null;
		const visualTime = sample?.time ?? game.time;
		updateRocketTrail(trail.current, sample?.shot, visualTime);
		updateRocketBubbles(bubbles.current, sample?.shot, visualTime, waterLevel);
		if (bubbleGroup.current)
			for (const [i, child] of bubbleGroup.current.children.entries()) {
				const mesh = child as Mesh;
				const point = bubbles.current.points[i];
				mesh.visible = Boolean(point);
				if (point) {
					const age = Math.max(0, visualTime - point.born);
					mesh.position.set(point.x + Math.sin(age * 6 + i) * 1.5, point.y + age * 45, 11);
					mesh.scale.setScalar(0.8 + 0.2 * Math.sin(i * 2) ** 2);
					(mesh.material as MeshBasicMaterial).opacity = 0.85 * Math.min(1, (1.2 - age) / 0.2);
				}
			}
		if (smoke.current)
			for (const [i, child] of smoke.current.children.entries()) {
				const t = trail.current.points[i],
					mesh = child as Mesh;
				mesh.visible = Boolean(t);
				if (t) {
					const age = Math.max(0, visualTime - t.born);
					mesh.position.set(t.x, t.y, 8);
					mesh.scale.setScalar(1);
					const mat = mesh.material as ShaderMaterial;
					mat.uniforms.uFrame.value = Math.min(
						27,
						Math.floor((age / (trailInterval(p?.age ?? 1) * TRAIL_LIMIT)) * 27)
					);
					mat.uniforms.uOpacity.value = p?.type === 'bazooka' ? 1 : Math.max(0, 1 - age / 0.35);
				}
			}
		if (countdownGroup.current) {
			countdownGroup.current.visible = p?.type === 'grenade';
			if (p) {
				const a = presentation.interpolationAlpha;
				countdownGroup.current.position.set(
					p.previousPosition.x + (p.position.x - p.previousPosition.x) * a - 14,
					p.previousPosition.y + (p.position.y - p.previousPosition.y) * a + 18,
					10
				);
			}
		}
		if (countdown.current) {
			countdown.current.style.display = p?.type === 'grenade' ? 'inline-flex' : 'none';
			if (p?.type === 'grenade') {
				const value = Math.max(1, Math.ceil(p.fuse - p.age));
				if (value !== countdownValue) setCountdownValue(value);
			}
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
				shotMaterial.current.uniforms.uWaterTint.value = p.state === 'submerged' ? 0.4 : 0;
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
		const ready = Boolean(
			canControlWorm(game) && worm && equipmentProgress(worm, game.weapon) >= 1 && !p
		);
		if (marker.current && markerMaterial.current) {
			marker.current.visible = Boolean(worm && game.turnMarker && !p && !game.weapon.isCharging);
			if (worm) marker.current.position.set(worm.position.x, worm.position.y + 104, 10);
			markerMaterial.current.uniforms.uFrame.value =
				Math.floor(game.time * 28) % (arrow.height / 60);
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
						const charge = game.weapon.isCharging
							? Math.min(
									1,
									game.weapon.charge +
										(presentation.interpolationAlpha * WORM.fixedStep) / WEAPON.chargeDuration
								)
							: 0;
						const progress = powerDotProgress(charge, i);
						mesh.visible = game.weapon.isCharging && ready && progress > 0;
						mesh.scale.setScalar(0.35 + 0.65 * progress);
						(mesh.material as ShaderMaterial).uniforms.uOpacity.value = 0.88 * progress;
						mesh.position.set(
							x + d.x * (12 + i * 2.5 + i * i * 0.2),
							y + d.y * (12 + i * 2.5 + i * i * 0.2),
							10
						);
					}
			}
		}
		if (dots.current && !worm) dots.current.visible = false;
		else if (dots.current) dots.current.visible = true;
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
			<group ref={bubbleGroup}>
				{Array.from({ length: ROCKET_BUBBLE_LIMIT }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Fixed bubble pool slots.
					<mesh key={i} visible={false}>
						<ringGeometry args={[1.6, 2.6, 12]} />
						<meshBasicMaterial color='#969fcd' transparent depthWrite={false} toneMapped={false} />
					</mesh>
				))}
			</group>
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
					fragmentShader={underwaterFragment}
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
						data-fuse-number={countdownValue}
						style={{
							display: 'none',
							background: '#08080c',
							color: '#fff',
							alignItems: 'center',
							justifyContent: 'center',
							padding: '2px 4px',
							border: '1px solid #a6a6b1',
							boxShadow: '0 0 0 1px #292933',
							borderRadius: 4,
							whiteSpace: 'nowrap',
						}}
					>
						<WormsVectorText text={String(countdownValue)} height={10} />
					</output>
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
								uOpacity: { value: 0 },
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
			<ExplosionVisuals game={game} />
		</>
	);
}
