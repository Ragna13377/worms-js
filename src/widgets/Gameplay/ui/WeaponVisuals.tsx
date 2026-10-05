import { WEAPON } from '@entities/Weapon/model/config';
import { aimDirection } from '@entities/Weapon/model/weapon';
import { WORM } from '@entities/Worm/model/config';
import { Html } from '@react-three/drei';
import { useFrame, useLoader } from '@react-three/fiber';
import reticle from '@src/assets/props/Misc/crshairr.png';
import grenade from '@src/assets/props/Weapons/grenade.png';
import missile from '@src/assets/props/Weapons/missile.png';
import { useMemo, useRef } from 'react';
import {
	type Group,
	type Mesh,
	type MeshBasicMaterial,
	NearestFilter,
	type ShaderMaterial,
	TextureLoader,
} from 'three';
import { activeWorm, type Game } from '../model/simulation';

const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader = `uniform sampler2D uMap; uniform float uFrame; uniform float uFrames; varying vec2 vUv;
void main(){vec4 c=texture2D(uMap,vec2(vUv.x,(vUv.y+uFrames-1.0-uFrame)/uFrames));if(distance(c.rgb,vec3(128.,128.,192.)/255.)<0.01)discard;gl_FragColor=c;}`;
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
	const textures = useLoader(TextureLoader, [missile.src, grenade.src, reticle.src]);
	useMemo(() => {
		for (const texture of textures) {
			texture.magFilter = texture.minFilter = NearestFilter;
			texture.generateMipmaps = false;
		}
	}, [textures]);
	const shotUniforms = useMemo(
		() => ({
			uMap: { value: textures[0] },
			uFrame: { value: 0 },
			uFrames: { value: missile.height / 60 },
		}),
		[textures]
	);
	const aimUniforms = useMemo(
		() => ({
			uMap: { value: textures[2] },
			uFrame: { value: 0 },
			uFrames: { value: reticle.height / 60 },
		}),
		[textures]
	);
	useFrame(() => {
		const p = game.projectiles[0];
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
		if (crosshair.current && aimMaterial.current) {
			crosshair.current.visible = Boolean(worm) && !p;
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
						mesh.visible = game.weapon.isCharging && i < Math.ceil(game.weapon.charge * 8);
						mesh.position.set(x + d.x * (15 + i * 5), y + d.y * (15 + i * 5), 10);
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
				{Array.from({ length: 8 }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Fixed presentation pool slots never reorder.
					<mesh key={i} visible={false}>
						<circleGeometry args={[1.3 + i * 0.35, 16]} />
						<meshBasicMaterial
							color={`hsl(${25 + i * 5},100%,55%)`}
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
