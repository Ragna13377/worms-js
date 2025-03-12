import { HexColor, Vector3 } from '@shared/types';
import { WaveProps } from '@entities/Wave/types';

export type WaterProps = {
	width: number;
	height: number;
	position: Vector3;
	color: HexColor;
	waveCount?: number;
	waveConfig?: Omit<WaveProps, 'position'>;
};

export type WaterUIProps = Required<WaterProps>;
