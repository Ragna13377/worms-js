import { WEAPON } from '@entities/Weapon/model/config';
import { WORM } from '@entities/Worm/model/config';
import { useFrame, useLoader } from '@react-three/fiber';
import circle from '@src/assets/props/Effects/circle50.png';
import ellipse from '@src/assets/props/Effects/elipse50.png';
import pow from '@src/assets/props/Effects/expow.png';
import fire from '@src/assets/props/Effects/flame1.png';
import dark from '@src/assets/props/Effects/smkdrk20.png';
import light from '@src/assets/props/Effects/smklt25.png';
import { useMemo, useRef } from 'react';
import { type Group, type Mesh, NearestFilter, type ShaderMaterial, TextureLoader } from 'three';
import type { Game } from '../model/simulation';

const sheets = [light, dark, fire, circle, ellipse, pow];
const vertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragment = `uniform sampler2D uMap;uniform float uFrame;uniform float uFrames;uniform float uOpacity;varying vec2 vUv;void main(){vec4 c=texture2D(uMap,vec2(vUv.x,(vUv.y+uFrames-1.-uFrame)/uFrames));if(distance(c.rgb,vec3(128.,128.,192.)/255.)<0.01||distance(c.rgb,vec3(192.,192.,128.)/255.)<0.01)discard;if(distance(c.rgb,vec3(32.,32.,248.)/255.)<0.01)discard;gl_FragColor=vec4(c.rgb,c.a*uOpacity);}`;
const PARTICLES = 18;
/** Local fire and blue/white smoke sheets; particle clocks follow the explosion simulation clock. */
export function ExplosionVisuals({ game }: { game: Game }) {
	const root = useRef<Group>(null);
	const textures = useLoader(
		TextureLoader,
		sheets.map((s) => s.src)
	);
	const pools = useMemo(() => {
		for (const texture of textures) {
			texture.minFilter = texture.magFilter = NearestFilter;
			texture.generateMipmaps = false;
		}
		return Array.from(
			{ length: game.worms.length + Math.ceil(WEAPON.fxDuration / WORM.fixedStep) },
			() =>
				Array.from({ length: PARTICLES + 3 }, (_, i) => {
					const type = i < PARTICLES ? i % 3 : i - PARTICLES + 3,
						image = sheets[type];
					return {
						type,
						image,
						uniforms: {
							uMap: { value: textures[type] },
							uFrame: { value: 0 },
							uFrames: { value: image.height / image.width },
							uOpacity: { value: 1 },
						},
					};
				})
		);
	}, [textures, game.worms.length]);
	useFrame(() => {
		if (!root.current) return;
		for (const [slot, group] of root.current.children.entries()) {
			const fx = game.explosions.effects[slot];
			group.visible = Boolean(fx);
			if (!fx) continue;
			group.position.set(fx.position.x, fx.position.y, 11);
			for (const [i, child] of group.children.entries()) {
				const mesh = child as Mesh,
					mat = mesh.material as ShaderMaterial;
				if (i >= PARTICLES) {
					const life = i === PARTICLES ? 0.24 : 0.3;
					mesh.visible = fx.age < life;
					mesh.position.set(0, 0, (i - PARTICLES + 1) * 0.01);
					mesh.scale.setScalar(fx.source === 'death' ? 0.7 : 1);
					mat.uniforms.uFrame.value = Math.min(
						mat.uniforms.uFrames.value - 1,
						Math.floor(
							i === PARTICLES + 2
								? fx.age < 0.18
									? (fx.age / 0.18) * 4
									: 4 + ((fx.age - 0.18) / 0.12) * 8
								: (fx.age / life) * mat.uniforms.uFrames.value
						)
					);
					continue;
				}
				const type = i % 3;
				const delay = (i % 6) * 0.008,
					t = Math.max(0, fx.age - delay),
					life = WEAPON.fxDuration - delay;
				const angle = i * 2.399963 + (fx.id % 7) * 0.4;
				const speed = (type === 2 ? 120 : 75) + (i % 5) * 16;
				mesh.visible = fx.age >= delay && t < life;
				mesh.position.set(
					Math.cos(angle) * speed * t,
					Math.abs(Math.sin(angle)) * speed * t + (type === 1 ? 25 : 45) * t - 100 * t * t,
					0
				);
				const progress = Math.min(1, t / life);
				mat.uniforms.uFrame.value = Math.min(
					mat.uniforms.uFrames.value - 1,
					Math.floor(progress * mat.uniforms.uFrames.value)
				);
				mat.uniforms.uOpacity.value = progress < 0.7 ? 1 : (1 - progress) / 0.3;
				mesh.scale.setScalar(
					(fx.source === 'death' ? 0.7 : 1) *
						(type === 0 ? 0.65 + (i % 4) * 0.22 : type === 1 ? 0.6 + (i % 4) * 0.25 : 0.7)
				);
			}
		}
	});
	return (
		<group ref={root}>
			{pools.map((particles, slot) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: Stable explosion presentation slots.
				<group key={slot} visible={false}>
					{particles.map((p, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Stable particle presentation slots.
						<mesh key={i}>
							<planeGeometry args={[p.image.width, p.image.width]} />
							<shaderMaterial
								uniforms={p.uniforms}
								vertexShader={vertex}
								fragmentShader={fragment}
								transparent
								depthWrite={false}
								depthTest={false}
								toneMapped={false}
							/>
						</mesh>
					))}
				</group>
			))}
		</group>
	);
}
