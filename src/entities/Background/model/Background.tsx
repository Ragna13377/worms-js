import { createUniforms } from '@shared/utils/shaderUtils';
import { BackgroundProps, TBackgroundUniforms } from '../types';
import { DEFAULT_BACKGROUND_SHADER_CONFIG } from '../constants';
import BackgroundUI from '../ui/BackgroundUI';

export const Background = ({ shader, ...props }: BackgroundProps) => {
	const uniform = createUniforms<TBackgroundUniforms>({
		...DEFAULT_BACKGROUND_SHADER_CONFIG,
		...shader,
		uTime: 0,
	});
	return <BackgroundUI uniform={uniform} {...props} />;
};

Background.displayName = 'Background';
