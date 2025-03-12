uniform vec3 uColorFrom;
uniform vec3 uColorTo;

varying vec2 vUv;

float easeInOut(float t) {
    return t * t * (3.0 - 2.0 * t);
}

void main() {
    float t = easeInOut(vUv.y);
    t = pow(t, 0.6);
    vec3 color = mix(uColorFrom, uColorTo, t);
    gl_FragColor = vec4(color, 1.0);
}