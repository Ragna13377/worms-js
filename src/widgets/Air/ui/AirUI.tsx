import { getRandomDirection, getRandomInRange } from '@shared/utils/mathUtils';
import { CLOUD_CONFIGS, cloudsSpeedRange } from '@entities/Cloud/constants';
import { TCloudType } from '@entities/Cloud/types';
import { Cloud } from '@entities/Cloud';
import { AirUIProps } from '../types';
import { cloudBandGap, cloudBandRange, cloudsPerType } from '@widgets/Air/constants';

const AirUI = ({ height, width, maxCloudsPerType = cloudsPerType }: AirUIProps) => {
	const cloudTypes: TCloudType[] = Object.keys(CLOUD_CONFIGS) as TCloudType[];
	return (
		<>
			{cloudTypes.flatMap((type, typeIndex) =>
				Array.from({ length: maxCloudsPerType }).map((_, index) => {
					const { name, size, scale, fps } = CLOUD_CONFIGS[type];
					const bandY = height - cloudBandGap * (cloudTypes.length - typeIndex);
					const YPos = getRandomInRange([bandY - cloudBandRange, bandY + cloudBandRange], 10)
					const xPos = getRandomInRange([0, width], 100);
					return (
						<Cloud
							key={`${size}-${index}`}
							name={name}
							position={[xPos, YPos, 0]}
							scale={scale}
							speed={getRandomInRange(cloudsSpeedRange, 10)}
							direction={getRandomDirection()}
							size={size}
							fps={fps}
							airWidth={width}
						/>
					);
				})
			)}
		</>
	);
};

export default AirUI;
