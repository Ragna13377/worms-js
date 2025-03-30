import { Cloud } from '@entities/Cloud';
import { AirUIProps } from '../types';

const AirUI = ({ clouds }: AirUIProps) => (
	<>
		{clouds.map((cloud, index) => (
			<Cloud key={`${cloud.size}-${index}`} {...cloud} />
		))}
	</>
);

export default AirUI;
