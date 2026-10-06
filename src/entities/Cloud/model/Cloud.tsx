'use client';
import { useFrame, useLoader } from '@react-three/fiber';
import large from '@src/assets/props/Misc/cloudl.png';
import medium from '@src/assets/props/Misc/cloudm.png';
import small from '@src/assets/props/Misc/clouds.png';
import { useMemo, useRef } from 'react';
import { NearestFilter, type ShaderMaterial, TextureLoader } from 'three';
import type { CloudProps } from '../types';
import { cloudFrame } from './animation';
import { useCloud } from './hooks/useCloud';

const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader = `uniform sampler2D uMap;uniform float uFrame;uniform float uFrames;varying vec2 vUv;void main(){vec4 c=texture2D(uMap,vec2(vUv.x,(vUv.y+uFrames-1.0-uFrame)/uFrames));if(distance(c.rgb,vec3(192.,192.,128.)/255.)<0.01)discard;gl_FragColor=c;}`;
/** Render the original sheet in world pixels consistently in development and export. */
export const Cloud = ({ name, position, fps, size, ...hookProps }: CloudProps) => {
	const { cloudRef } = useCloud({ size, ...hookProps });
	const image = name === 'clouds' ? small : name === 'cloudm' ? medium : large;
	const texture = useLoader(TextureLoader, image.src);
	const material = useRef<ShaderMaterial>(null);
	const uniforms = useMemo(() => {
		texture.magFilter = texture.minFilter = NearestFilter;
		texture.generateMipmaps = false;
		return {
			uMap: { value: texture },
			uFrame: { value: 0 },
			uFrames: { value: image.height / image.width },
		};
	}, [texture, image]);
	useFrame(({ clock }) => {
		if (material.current)
			material.current.uniforms.uFrame.value = cloudFrame(
				Math.floor(clock.elapsedTime * fps),
				image.height / image.width
			);
	});
	return (
		<group ref={cloudRef} position={position}>
			<mesh>
				<planeGeometry args={[size, size]} />
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
		</group>
	);
};
