uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uPhaseOffset;
uniform float uSpeedVariation;

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

float random(float seed) {
    return fract(sin(seed) * 43758.5453);
}

void main() {
    vUv = uv;

    float amplitudeNoise = multiLayerNoise(uTime * 0.5 + position.x * 0.01);
    float frequencyNoise = multiLayerNoise(uTime * 0.5 + position.x * 0.01);

    float targetAmplitude = uAmplitude * (1.5 + 0.5 * amplitudeNoise);
    float targetFrequency = uFrequency * (1.5 + 0.5 * frequencyNoise);

    float localAmplitude = quadraticInterpolation(uAmplitude, targetAmplitude, 0.1);
    float localFrequency = quadraticInterpolation(uFrequency, targetFrequency, 0.01);

    float wave = sin(position.x * localFrequency  + uTime * (5.0 + uSpeedVariation) + uPhaseOffset) * localAmplitude * 0.5;
    wave += sin(position.x * localFrequency * 1.5 + uTime * (10.0 + uSpeedVariation) + uPhaseOffset) * localAmplitude * 0.4;

    vec3 newPosition = vec3(position.x, position.y + wave, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}