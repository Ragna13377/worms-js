import { SpriteAnimator } from '@react-three/drei';
import { CloudUIProps } from '../types';

//TODO: проверить ошибочные пути
const CloudUI = ({ name, position, scale, spriteObj, ref }: CloudUIProps) => (
	<SpriteAnimator
		ref={ref}
		position={position}
		autoPlay
		loop
		scale={scale}
		frameName={name}
		animationNames={[name]}
		spriteDataset={spriteObj}
		alphaTest={0.01}
		asSprite={false}
		// fps={30}
	/>
);

export default CloudUI;
