import { TVector3 } from '@shared/types';
import { TWaveConfig, TWaveShaderConfig, WaveProps } from '@entities/Wave/types';
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
	waveConfig?: Partial<TWaveConfig> & {
		shaderConfig?: Partial<TWaveShaderConfig>;
	};
};

export type WaterUIProps = BaseWaterProps & {
	bubbles: BubbleProps[];
	waves: Omit<WaveProps, 'index'>[];
};
