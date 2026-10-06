varying vec2 vUv;
varying float vWorldY;
uniform float uGradientHeight;

uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uEdgeSharpness;
uniform float uBlendFactor;
uniform float uGradientPower;
uniform float uCenterPoint;

void main() {
    float blend = smoothstep(uCenterPoint - uEdgeSharpness, uCenterPoint + uEdgeSharpness, clamp(vWorldY / uGradientHeight + 0.5, 0.0, 1.0));
    blend = vWorldY >= uGradientHeight * 0.5 ? 1.0 : clamp(blend * uBlendFactor, 0.0, 1.0);

    vec3 color = mix(uBottomColor, uTopColor, pow(blend, uGradientPower));
    gl_FragColor = vec4(color, 1.0);
}