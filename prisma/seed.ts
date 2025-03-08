import { PrismaClient } from '@prisma/client';
import timeSegments from './seeds/timeSegments.json';

const prisma = new PrismaClient();
const dbSeed = async () => {
	// await Promise.all([prisma.timeSegments.createMany({ data: timeSegments })]);
};
dbSeed()
	.then(() => console.log('Данные добавлены в БД'))
	.catch((e) => console.log(e))
	.finally(async () => {
		await prisma.$disconnect();
	});
