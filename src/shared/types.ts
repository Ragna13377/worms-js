import * as THREE from 'three';
import { Vector3 } from '@react-three/fiber';
import { SpriteData } from '@react-three/drei/core/useSpriteLoader';

export type HexColor = `#${string}`;
export type TVector3 = [number, number, number];
export type TVector2 = [number, number];

export const isHexColor = (color: string): color is HexColor =>
	/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);

export type TSpriteObj = {
	spriteTexture: THREE.Texture;
	spriteData: SpriteData | null;
	aspect: Vector3;
} | null;
