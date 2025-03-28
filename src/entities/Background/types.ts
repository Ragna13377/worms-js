import { Color } from 'three';
import { TVector2, Uniformize } from '@shared/types';
import { Vector3 } from '@react-three/fiber';

/**
 * Конфигурация градиента
 * @property {number} [uEdgeSharpness] - Размытие границы (0 - резкая, > 0 - сглаживание)
 * @property {number} [uBlendFactor] - Смещение границы градиента
 * @property {number} [uGradientPower] - Усиление верхнего/нижнего цвета градиента
 * @property {number} [uCenterPoint] - Центральная точка градиента
 */
export type TBackgroundShader = {
	uTopColor: Color;
	uBottomColor: Color;
	uEdgeSharpness: number;
	uBlendFactor: number;
	uGradientPower: number;
	uCenterPoint: number;
};

export type TBackgroundUniforms = Uniformize<TBackgroundShader>;

export type BackgroundProps = {
	size: TVector2;
	position: Vector3;
	shader?: Partial<TBackgroundShader>;
};

export type BackgroundUIProps = Omit<BackgroundProps, 'shader'> & {
	uniform: TBackgroundUniforms;
};
