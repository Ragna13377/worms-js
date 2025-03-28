import { TVector3 } from '@shared/types';
import { WaveProps } from '@entities/Wave/types';
import { Color } from 'three';
import { BubbleProps, TBubbleConfig } from '@entities/Bubble/types';

type BaseWaterProps = {
	width: number;
	height: number;
	position: TVector3;
	color: Color;
};

export type WaterProps = BaseWaterProps & {
	bubbleConfig?: Partial<TBubbleConfig>;
	waveCount?: number;
	waveConfig?: Partial<Pick<WaveProps, 'shaderConfig' | 'thickness' | 'overlapFactor'>>;
};

export type WaterUIProps = Omit<WaterProps, 'waveCount'> & {
	bubbles: BubbleProps[];
	waveCount: number;
	baseWaveYPos: number;
	waveOffsets: number[];
};
