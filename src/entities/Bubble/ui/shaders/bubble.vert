uniform float uTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uWobbleIntensity;
uniform float uWobbleSpeed;

void main() {
    float moveY = uTime * uSpeed;

    float offsetX = sin(uTime * uFrequency) * uAmplitude;

    float wobbleX = sin(uTime * uWobbleSpeed) * uWobbleIntensity;
    float wobbleY = cos(uTime * uWobbleSpeed) * uWobbleIntensity;

    vec3 newPosition = vec3(
    position.x + offsetX + wobbleX,
    position.y + moveY + wobbleY,
    position.z
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}