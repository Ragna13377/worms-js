import { seededRandom } from '../../Terrain/model/terrain';

const NAME_POOL = [
	'Wormington',
	'Sir Squiggle',
	'Mud Vader',
	'Worminator',
	'Dirt Reynolds',
	'Wiggleton',
	'Captain Compost',
	'Earthworm Jim',
	'Wormageddon',
	'Baitman',
	'Squirm Holmes',
	'Muddy Mercury',
	'Worm Solo',
	'Diggy Stardust',
	'Count Wriggle',
	'Grub Norris',
];

/** Separate seeded stream keeps names unique without changing terrain or spawn positions. */
export function wormNames(seed: number) {
	const names = [...NAME_POOL];
	const random = seededRandom(seed ^ 0x4e414d45);
	for (let index = names.length - 1; index > 0; index--) {
		const other = Math.floor(random() * (index + 1));
		[names[index], names[other]] = [names[other], names[index]];
	}
	return names;
}
