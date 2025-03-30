import { CloudProps } from '@entities/Cloud/types';

export type AirProps = {
	width: number;
	height: number;
	maxCloudsPerType?: number;
};

export type AirUIProps = {
	clouds: CloudProps[];
};
