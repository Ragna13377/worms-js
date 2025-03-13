import { isHexColor } from '@shared/types';
import { defaultOverlapFactor, defaultWaveColor, defaultWaveConfig } from '../constants';
import { WaterProps } from '../types';
import WaterUI from '../ui/WaterUI';

export const Water = ({ color, waveParameters, ...props }: WaterProps) => {
	const uiProps = {
		...props,
		color: isHexColor(color) ? color : defaultWaveColor,
		waveParameters: {
			waveCount: waveParameters?.waveCount ?? 1,
			waveConfig: waveParameters?.waveConfig ?? defaultWaveConfig,
			overlapFactor: waveParameters?.overlapFactor ?? defaultOverlapFactor,
		},
	};

	return <WaterUI {...uiProps} />;
};
