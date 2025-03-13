import { HexColor, Vector3 } from '@shared/types';
import { WaveProps } from '@entities/Wave/types';

type BaseWaterProps = {
	width: number;
	height: number;
	position: Vector3;
	color: HexColor;
};

type WaveOptions = {
	waveCount: number;
	waveConfig?: Omit<WaveProps, 'position' | 'phaseOffset' | 'width'>;
	overlapFactor?: number;
};

export type WaterProps = BaseWaterProps & {
	waveParameters?: WaveOptions;
};

export type WaterUIProps = BaseWaterProps & {
	waveParameters: Required<WaveOptions>;
};
