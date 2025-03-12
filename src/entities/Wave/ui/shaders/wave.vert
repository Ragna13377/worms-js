uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uPhaseOffset;

varying vec2 vUv;

float quadraticInterpolation(float a, float b, float t) {
    t = t * t * (3.0 - 2.0 * t);
    return mix(a, b, t);
}

float multiLayerNoise(float x) {
    float noise = 0.0;
    noise += sin(x) * 0.5;
    noise += sin(x * 1.5 + 1.0) * 0.25;
    noise += sin(x * 2.0 + 2.0) * 0.125;
    noise += sin(x * 3.0 + 3.0) * 0.0625;
    return noise;
}

void main() {
    vUv = uv;

    float amplitudeNoise = multiLayerNoise(uTime * 0.01 + position.x * 0.005);
    float targetAmplitude = uAmplitude * (0.5 + 0.05 * amplitudeNoise);
    float localAmplitude = quadraticInterpolation(uAmplitude, targetAmplitude, 0.01);

    float frequencyNoise = multiLayerNoise(uTime * 0.008 + position.x * 0.01);
    float targetFrequency = uFrequency * (1.0 + 0.05 * frequencyNoise);
    float localFrequency = quadraticInterpolation(uFrequency, targetFrequency, 0.01);

    float wave = sin(position.x * localFrequency + uTime * 0.75 + uPhaseOffset) * localAmplitude * 0.5;

    wave += sin(position.x * localFrequency * 1.5 + uTime * 0.75 + uPhaseOffset) * localAmplitude * 0.4;
    vec3 newPosition = vec3(position.x, position.y + wave, position.z);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}