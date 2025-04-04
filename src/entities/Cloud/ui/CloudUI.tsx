import { SpriteAnimator } from '@react-three/drei';
import { CloudUIProps } from '../types';

//TODO: проверить ошибочные пути
const CloudUI = ({ ref, ...props }: CloudUIProps) => (
	<SpriteAnimator ref={ref} autoPlay loop alphaTest={0.01} {...props} />
);

CloudUI.displayName = 'CloudUI';
export default CloudUI;
