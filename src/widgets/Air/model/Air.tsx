import { memo, useMemo } from 'react';
import { Vector3 } from 'three';
import { getRandomDirection, getRandomInRange } from '@shared/utils/mathUtils';
import { CLOUD_CONFIGS, cloudsSpeedRange } from '@entities/Cloud/constants';
import { CloudProps, TCloudType } from '@entities/Cloud/types';
import { cloudBandGap, cloudBandRange, cloudsPerType } from '../constants';
import { AirProps } from '../types';
import AirUI from '../ui/AirUI';

export const Air = memo(({ height, width, maxCloudsPerType = cloudsPerType }: AirProps) => {
	const cloudTypes = Object.keys(CLOUD_CONFIGS) as TCloudType[];
	const clouds = useMemo(
		() =>
			cloudTypes.reduce((acc, type, typeIndex) => {
				const bandY = height - cloudBandGap * (cloudTypes.length - typeIndex);
				const cloudsForType = [...Array(maxCloudsPerType)].map(() => {
					const YPos = getRandomInRange({
						range: [bandY - cloudBandRange, bandY + cloudBandRange],
						step: 10,
					});
					const xPos = getRandomInRange({
						range: [-width / 2, width / 2],
						step: 100,
					});
					return {
						...CLOUD_CONFIGS[type],
						position: new Vector3(xPos, YPos, 0),
						direction: getRandomDirection(),
						speed: getRandomInRange(cloudsSpeedRange),
						airWidth: width,
					};
				});
				return acc.concat(cloudsForType);
			}, [] as CloudProps[]),
		[cloudTypes, height, maxCloudsPerType, width]
	);
	return <AirUI clouds={clouds} />;
});

Air.displayName = 'Air';
