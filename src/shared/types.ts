export type TUniform<T> = { value: T };
export type TUniformValue<T> = T extends { value: infer V } ? V : never;
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
export type Uniformize<T, Extra extends Record<string, unknown> = {}> = {
	[K in keyof T]: TUniform<T[K]>;
} & {
	[K in keyof Extra]: TUniform<Extra[K]>;
} & {
	uTime: TUniform<number>;
};

export type HexColor = `#${string}`;
export type TVector3 = [number, number, number];
export type TVector2 = [number, number];

export const isHexColor = (color: string): color is HexColor =>
	/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);

export type TRange = {
	range: TVector2;
	step?: number;
};
