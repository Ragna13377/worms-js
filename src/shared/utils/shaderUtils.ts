import { TUniformValue } from '@shared/types';

export const createUniforms = <T extends Record<string, { value: unknown }>>(
	config: {[K in keyof T]: TUniformValue<T[K]>}
): T =>
	Object.keys(config).reduce(
		(acc, key) => ({
			...acc,
			[key]: { value: config[key] },
		}),
		{} as T
	);
