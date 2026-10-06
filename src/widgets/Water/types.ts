import type { BubbleProps, TBubbleConfig } from '@entities/Bubble/types';
import type { TWaveConfig, TWaveShaderConfig, WaveProps } from '@entities/Wave/types';
import type { TVector3 } from '@shared/types';
import type { Color } from 'three';

type BaseWaterProps = {
	width: number;
	height: number;
	position: TVector3;
	color: Color;
};

export type WaterProps = BaseWaterProps & {
	wind?: number;
	bubbleConfig?: Partial<TBubbleConfig>;
	waveCount?: number;
	backgroundWaveCount?: number;
	waveConfig?: Partial<TWaveConfig> & {
		shaderConfig?: Partial<TWaveShaderConfig>;
	};
};

export type WaterUIProps = BaseWaterProps & {
	bubbles: BubbleProps[];
	waves: Omit<WaveProps, 'index'>[];
};
