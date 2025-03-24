import { memo } from 'react';
import { AirProps } from '../types';
import AirUI from '../ui/AirUI';

export const Air = memo((props: AirProps) => <AirUI {...props} />);

Air.displayName = 'Air';
