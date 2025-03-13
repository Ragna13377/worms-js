import { shuffleArray } from '@shared/utils/arrayUtils';

type WaveOffsetCalculationProps = {
	index: number;
	baseY: number;
	amplitude: number;
	thickness: number;
	overlapFactor: number;
};

export const WaveOffsetCalculation = ({
	index,
	baseY,
	amplitude,
	thickness,
	overlapFactor,
}: WaveOffsetCalculationProps) => {
	if (index === 0) return baseY;
	return baseY - (amplitude * 2 + thickness * overlapFactor) * index;
};

export type TPhaseOffsetGenerator = Generator<number, void, unknown>;
export function* phaseOffsetGenerator(count: number): TPhaseOffsetGenerator {
	const step = (3 * Math.PI) / (3 * count);
	const offsets = Array.from({ length: count }, (_, index) => index * step);
	const shuffleOffsets = shuffleArray(offsets);
	for (const offset of shuffleOffsets) {
		yield offset;
	}
}
