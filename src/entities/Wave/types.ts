import { Vector3 } from '@react-three/fiber';

type Uniform<T> = { value: T };
type TUniforms = {
	uTime: Uniform<number>;
	uAmplitude: Uniform<number>;
	uFrequency: Uniform<number>;
	uColorFrom: Uniform<Vector3>;
	uColorTo: Uniform<Vector3>;
	uColorBlendPower: Uniform<number>;
	uPhaseOffset: Uniform<number>;
	uSpeedVariation: Uniform<number>;
};

export type WaveProps = {
	width: number;
	thickness: number;
	position: Vector3;
	amplitude: number;
	frequency: number;
	phaseOffset: number;
	colorFrom: Vector3;
	colorTo: Vector3;
	colorBlendPower: number;
	overlapFactor: number;
};

export type WaveUIProps = Pick<WaveProps, 'thickness' | 'position' | 'width'> & {
	uniforms: TUniforms;
};
