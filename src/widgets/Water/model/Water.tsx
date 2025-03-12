import { WaterProps } from '../types';
import WaterUI from '../ui/WaterUI';
import {
	defaultColorFrom,
	defaultColorTo,
	defaultWaveAmplitude,
	defaultWaveColor,
	defaultWaveFrequency,
	defaultWaveThickness,
} from '@widgets/Water/constants';
import { hexToRgb } from '@shared/utils/colorFormatter';
import { isHexColor } from '@shared/types';

export const Water = ({ color, waveCount, waveConfig, ...props }: WaterProps) => {
	const defaultWaveConfig = {
		amplitude: defaultWaveAmplitude,
		frequency: defaultWaveFrequency,
		thickness: defaultWaveThickness,
		colorFrom: hexToRgb(defaultColorFrom),
		colorTo: hexToRgb(defaultColorTo),
	};
	return (
		<WaterUI
			color={isHexColor(color) ? color : defaultWaveColor}
			waveCount={waveCount ?? 0}
			waveConfig={waveConfig ?? defaultWaveConfig}
			{...props}
		/>
	);
};
