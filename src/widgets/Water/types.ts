import { HexColor, TVector3 } from '@shared/types';
import { WaveProps } from '@entities/Wave/types';

type BaseWaterProps = {
	width: number;
	height: number;
	position: TVector3;
	color: HexColor;
};

export type WaterProps = BaseWaterProps & {
	waveCount?: number;
	waveConfig?: Partial<Omit<WaveProps, 'position' | 'phaseOffset' | 'width'>>;
};

export type WaterUIProps = BaseWaterProps & {
	waveCount: number;
	offsets: number[];
	waveConfig: Omit<WaveProps, 'position' | 'phaseOffset' | 'width'>;
};
