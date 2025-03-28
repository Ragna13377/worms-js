varying vec2 vUv;

uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uEdgeSharpness;
uniform float uBlendFactor;
uniform float uGradientPower;
uniform float uCenterPoint;

void main() {
    float blend = smoothstep(uCenterPoint - uEdgeSharpness, uCenterPoint + uEdgeSharpness, vUv.y);
    blend = clamp(blend * uBlendFactor, 0.0, 1.0);

    vec3 color = mix(uBottomColor, uTopColor, pow(blend, uGradientPower));
    gl_FragColor = vec4(color, 1.0);
}