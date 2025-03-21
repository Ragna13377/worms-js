import { getRandomDirection, getRandomInRange } from '@shared/utils/mathUtils';
import { CLOUD_CONFIGS, cloudsSpeedRange } from '@entities/Cloud/constants';
import { TCloudType } from '@entities/Cloud/types';
import { Cloud } from '@entities/Cloud';
import { AirUIProps } from '../types';
import { defaultCloudsPerType } from '@widgets/Air/constants';

const AirUI = ({ width, maxCloudsPerType = defaultCloudsPerType }: AirUIProps) => {
	const cloudTypes: TCloudType[] = Object.keys(CLOUD_CONFIGS) as TCloudType[];
	return (
		<>
			{cloudTypes.flatMap((type) =>
				Array.from({ length: maxCloudsPerType }).map((_, index) => {
					const { name, baseHeight, size, scale } = CLOUD_CONFIGS[type];
					const height = getRandomInRange([baseHeight - size / 2, baseHeight + size / 2], 5);
					const xPos = getRandomInRange([0, width], 100);
					return (
						<Cloud
							key={`${size}-${index}`}
							name={name}
							position={[xPos, height, 0]}
							scale={scale}
							speed={getRandomInRange(cloudsSpeedRange, 10)}
							direction={getRandomDirection()}
							size={size}
							airWidth={width}
						/>
					);
				})
			)}
		</>
	);
};

export default AirUI;
