varying vec2 vUv;
varying float vWorldY;

void main() {
    vUv = uv;
    vWorldY = (modelMatrix * vec4(position, 1.0)).y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}