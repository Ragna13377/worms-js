import { useFrame, useLoader } from '@react-three/fiber';
import grave from '@src/assets/props/Misc/grave1.png';
import bazookaPose from '@src/assets/props/Worms/wbaz.png';
import grenadePose from '@src/assets/props/Worms/wthrgrn.png';
import { useEffect, useMemo, useRef } from 'react';
import { type Group, type Mesh, NearestFilter, type ShaderMaterial, TextureLoader } from 'three';
import type { TerrainModel } from '../../Terrain/model/terrain';
import { equipmentProgress } from '../../Weapon/model/presentation';
import type { WeaponState } from '../../Weapon/model/weapon';
import { spriteFrame } from '../model/animation';
import { WORM } from '../model/config';
import { restingY, spriteGroundDrop } from '../model/support';
import type { Worm } from '../model/worm';
import { SPRITES, spriteName } from './sprites';
import { WormLabel } from './WormLabel';

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
		if (distance(pixel.rgb, vec3(128.0, 128.0, 192.0) / 255.0) < 0.01 || distance(pixel.rgb, vec3(192.0, 192.0, 128.0) / 255.0) < 0.01) discard;
		gl_FragColor = vec4(mix(pixel.rgb, vec3(1.0, 0.3, 0.3), uHurt), pixel.a * uOpacity);
	}
`;

/** Sample intact vertical sheets; the original purple palette key is discarded by the shader. */
export type WormPresentation = {
	interpolationAlpha: number;
	weapon?: WeaponState;
	activeWormId?: string | null;
	shotActive?: boolean;
};
export function WormVisual({
	worm,
	presentation,
	terrain,
}: {
	worm: Worm;
	presentation: WormPresentation;
	terrain: TerrainModel;
}) {
	const group = useRef<Group>(null);
	const sprite = useRef<Mesh>(null);
	const graveY = useRef<number | null>(null);
	const graveDirty = useRef(true);
	useEffect(
		() =>
			terrain.subscribe(() => {
				graveDirty.current = true;
			}),
		[terrain]
	);

	const material = useRef<ShaderMaterial>(null);
	const textures = useLoader(TextureLoader, [
		...names.map((name) => SPRITES[name].image.src),
		bazookaPose.src,
		grenadePose.src,
		grave.src,
	]);
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
		const alpha = presentation.interpolationAlpha;
		const x = worm.previousPosition.x + (worm.position.x - worm.previousPosition.x) * alpha;
		const y = worm.previousPosition.y + (worm.position.y - worm.previousPosition.y) * alpha;
		const state = worm.animationState;

		const drowning = state === 'drown';
		const graveVisible = !worm.alive && !drowning && worm.stateTime >= WORM.deathDuration;
		if (graveVisible && (graveDirty.current || graveY.current === null)) {
			graveY.current =
				restingY(terrain, x, y + worm.collisionRadius * 2, terrain.bottom, worm.collisionRadius) ??
				y;
			graveDirty.current = false;
		}
		group.current.visible = !drowning || worm.alive || worm.stateTime < WORM.drownDuration;
		group.current.position.set(
			x,
			graveVisible ? (graveY.current ?? y) : y - (drowning ? worm.stateTime * 22 : 0),
			6
		);
		const name = spriteName(worm);
		const clip = SPRITES[name];
		const frames = clip.image.height / 60;
		const clock = worm.jumpType && !worm.grounded ? worm.jumpTime : worm.stateTime;
		const rawFrame = Math.floor(clock * clip.fps);
		const shader = material.current.uniforms;
		shader.uMap.value = textures[names.indexOf(name)];
		shader.uFrames.value = frames;
		const frame = spriteFrame(rawFrame, frames, clip.playback);
		shader.uFrame.value = name === 'jump' ? frames - 1 - frame : frame;
		const equipped =
			presentation.weapon &&
			presentation.activeWormId === worm.id &&
			!presentation.shotActive &&
			worm.alive &&
			worm.grounded &&
			state === 'idle' &&
			equipmentProgress(worm, presentation.weapon) > 0;
		if (equipped && presentation.weapon) {
			const bazooka = presentation.weapon.selectedWeapon === 'bazooka';
			const pose = bazooka ? bazookaPose : grenadePose;
			shader.uMap.value = textures[names.length + (bazooka ? 0 : 1)];
			shader.uFrames.value = pose.height / 60;
			shader.uFrame.value = bazooka
				? Math.round((presentation.weapon.aimAngle / Math.PI + 0.5) * (pose.height / 60 - 1))
				: 0;
		}
		if (graveVisible) {
			shader.uMap.value = textures[names.length + 2];
			shader.uFrames.value = grave.height / 60;
			shader.uFrame.value = 0;
		}
		// Original artwork faces left; reverse UVs for right-facing gameplay.
		shader.uFlip.value = worm.facing === 'right' ? 1 : 0;
		shader.uOpacity.value = drowning ? Math.max(0, 1 - worm.stateTime / WORM.drownDuration) : 1;
		shader.uHurt.value = state === 'hurt' ? (Math.sin(worm.stateTime * 40) + 1) * 0.25 : 0;
		const drop = worm.grounded ? spriteGroundDrop(terrain, x, y, worm.collisionRadius) : 0;
		const scaleY =
			state === 'land' ? 0.9 + Math.min(1, worm.stateTime / WORM.landDuration) * 0.1 : 1;
		// Row 42 is the fixed foot baseline in idle/walk/land; keep it anchored during squash.
		sprite.current.position.y = (graveVisible ? 2 : 13 * scaleY) - worm.collisionRadius - drop;
		const drawScale =
			equipped && presentation.weapon
				? 0.9 + 0.1 * equipmentProgress(worm, presentation.weapon)
				: 1;
		sprite.current.scale.set(drawScale, scaleY * drawScale, 1);
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
			<WormLabel worm={worm} />
		</group>
	);
}
