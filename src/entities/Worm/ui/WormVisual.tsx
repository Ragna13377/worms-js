import { useFrame, useLoader } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type Group, type Mesh, NearestFilter, type ShaderMaterial, TextureLoader } from 'three';
import type { Game } from '../../../widgets/Gameplay/model/simulation';
import { WORM } from '../model/config';
import type { Worm } from '../model/worm';
import { SPRITES, spriteName } from './sprites';

const names = Object.keys(SPRITES) as (keyof typeof SPRITES)[];
const vertexShader = `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;
const fragmentShader = `
	uniform sampler2D uMap;
	uniform float uFrames;
	uniform float uFrame;
	uniform float uFlip;
	uniform float uOpacity;
	uniform float uHurt;
	varying vec2 vUv;
	void main() {
		float x = uFlip > 0.5 ? 1.0 - vUv.x : vUv.x;
		vec2 uv = vec2(x, (vUv.y + uFrames - 1.0 - uFrame) / uFrames);
		vec4 pixel = texture2D(uMap, uv);
		if (distance(pixel.rgb, vec3(128.0, 128.0, 192.0) / 255.0) < 0.01) discard;
		gl_FragColor = vec4(mix(pixel.rgb, vec3(1.0, 0.3, 0.3), uHurt), pixel.a * uOpacity);
	}
`;

/** Sample intact vertical sheets; the original purple palette key is discarded by the shader. */
export function WormVisual({ worm, game }: { worm: Worm; game: Game }) {
	const group = useRef<Group>(null);
	const sprite = useRef<Mesh>(null);
	const marker = useRef<Mesh>(null);
	const material = useRef<ShaderMaterial>(null);
	const textures = useLoader(
		TextureLoader,
		names.map((name) => SPRITES[name].image.src)
	);
	useMemo(() => {
		for (const texture of textures) {
			texture.magFilter = texture.minFilter = NearestFilter;
			texture.generateMipmaps = false;
			texture.needsUpdate = true;
		}
	}, [textures]);
	const uniforms = useMemo(
		() => ({
			uMap: { value: textures[0] },
			uFrames: { value: 20 },
			uFrame: { value: 0 },
			uFlip: { value: 0 },
			uOpacity: { value: 1 },
			uHurt: { value: 0 },
		}),
		[textures]
	);

	useFrame(() => {
		if (!group.current || !sprite.current || !material.current) return;
		const alpha = game.accumulator / WORM.fixedStep;
		const x = worm.previousPosition.x + (worm.position.x - worm.previousPosition.x) * alpha;
		const y = worm.previousPosition.y + (worm.position.y - worm.previousPosition.y) * alpha;
		const state = worm.animationState;
		const dying = state === 'death';
		const drowning = state === 'drown';
		group.current.visible =
			worm.alive || worm.stateTime < (drowning ? WORM.drownDuration : WORM.deathDuration);
		group.current.position.set(x, y - (drowning ? worm.stateTime * 22 : 0), 6);
		const name = spriteName(worm);
		const clip = SPRITES[name];
		const frames = clip.image.height / 60;
		const clock = name === 'backflip' ? worm.jumpTime : worm.stateTime;
		const rawFrame = Math.floor(clock * clip.fps);
		const shader = material.current.uniforms;
		shader.uMap.value = textures[names.indexOf(name)];
		shader.uFrames.value = frames;
		shader.uFrame.value = clip.loop ? rawFrame % frames : Math.min(frames - 1, rawFrame);
		// Original artwork faces left; reverse UVs for right-facing gameplay.
		shader.uFlip.value = worm.facing === 'right' ? 1 : 0;
		shader.uOpacity.value = drowning ? Math.max(0, 1 - worm.stateTime / WORM.drownDuration) : 1;
		shader.uHurt.value = state === 'hurt' ? (Math.sin(worm.stateTime * 40) + 1) * 0.25 : 0;
		sprite.current.scale.set(
			1,
			state === 'land' ? 0.9 + Math.min(1, worm.stateTime / WORM.landDuration) * 0.1 : 1,
			1
		);
		if (marker.current)
			marker.current.visible = game.debugActiveWormId === worm.id && !dying && !drowning;
	});
	return (
		<group ref={group}>
			<mesh ref={sprite} position={[0, 5, 0]}>
				<planeGeometry args={[60, 60]} />
				<shaderMaterial
					ref={material}
					uniforms={uniforms}
					vertexShader={vertexShader}
					fragmentShader={fragmentShader}
					transparent
					depthWrite={false}
					toneMapped={false}
				/>
			</mesh>
			<mesh position={[0, 28, 0.1]}>
				<planeGeometry args={[8, 2]} />
				<meshBasicMaterial color={worm.team === 'RED' ? '#e76a63' : '#6baff0'} toneMapped={false} />
			</mesh>
			<mesh ref={marker} position={[0, 33, 0.1]}>
				<circleGeometry args={[2, 3]} />
				<meshBasicMaterial color='#fff0bf' toneMapped={false} />
			</mesh>
		</group>
	);
}
