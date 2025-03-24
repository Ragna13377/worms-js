import { TVector3 } from '@shared/types';
import { WaveProps } from '@entities/Wave/types';
import { Color } from 'three';

type BaseWaterProps = {
	width: number;
	height: number;
	position: TVector3;
	color: Color;
};

export type WaterProps = BaseWaterProps & {
	waveCount?: number;
	waveConfig?: Partial<Pick<WaveProps, 'shaderConfig' | 'thickness' | 'overlapFactor'>>;
};

export type WaterUIProps = Omit<WaterProps, 'waveCount'> & {
	waveCount: number;
	baseWaveYPos: number;
	waveOffsets: number[];
};
