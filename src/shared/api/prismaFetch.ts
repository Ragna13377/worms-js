import { ZodSchema } from 'zod';
import { notFound } from 'next/navigation';

type PrismaFetchProps<T> = {
	query: () => Promise<T>;
	schema: ZodSchema<T>;
	notFoundRedirect?: boolean;
};

export const prismaFetch = async <T>({
	query,
	schema,
	notFoundRedirect = false,
}: PrismaFetchProps<T>) => {
	try {
		const result = await query();
		const parseResult = schema.safeParse(result);
		if (!parseResult.success) {
			console.log('Incorrect data: ', parseResult.error);
			if (notFoundRedirect) notFound();
			return null;
		}
		return parseResult.data;
	} catch (_) {
		console.log('DB connection error');
		if (notFoundRedirect) notFound();
		return null;
	}
};
