import { Cloud } from '@entities/Cloud';
import { AirUIProps } from '../types';

const AirUI = ({ clouds }: AirUIProps) => (
	<>
		{clouds.map((cloud, index) => (
			<Cloud key={`${cloud.size}-${index}`} {...cloud} />
		))}
	</>
);

AirUI.displayName = 'AirUI';
export default AirUI;
