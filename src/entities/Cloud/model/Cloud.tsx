import { getCloudSource } from '../utils';
import { CloudProps } from '../types';
import CloudUI from '../ui/CloudUI';

export const Cloud = ({ size }: CloudProps) => {
	const cloudSource = getCloudSource(size);
	return <CloudUI source={cloudSource} />;
};
