uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;

void main() {
    // Create gradient based on position
    float mixValue = sin(vPosition.y * 0.5 + uTime) * 0.5 + 0.5;
    mixValue *= sin(vPosition.x * 0.3 + uTime * 0.7) * 0.5 + 0.5;
    
    // Add random variation
    mixValue += vRandom * 0.1;
    
    // Mix colors
    vec3 color = mix(uColorA, uColorB, mixValue);
    
    // Add some brightness variation
    float brightness = sin(vUv.x * 10.0 + uTime * 2.0) * 0.1 + 0.9;
    color *= brightness;
    
    gl_FragColor = vec4(color, 1.0);
} 