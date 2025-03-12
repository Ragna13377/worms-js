export type Vector3 = [number, number, number];
export type HexColor = `#${string}`;

export const isHexColor = (color: string): color is HexColor =>
	/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
