import { Vector3 } from '@shared/types';

type Uniform<T> = { value: T };
type TUniforms = {
	uTime: Uniform<number>;
	uAmplitude: Uniform<number>;
	uFrequency: Uniform<number>;
	uColorFrom: Uniform<Vector3>;
	uColorTo: Uniform<Vector3>;
	uPhaseOffset: Uniform<number>;
};

export type WaveProps = {
	amplitude: number;
	frequency: number;
	thickness: number;
	colorFrom: Vector3;
	colorTo: Vector3;
	position: Vector3;
};

export type WaveUIProps = Pick<WaveProps, 'thickness'> & {
	uniforms: TUniforms;
	position: Vector3;
};
