uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;

void main() {
    // Create complex gradient based on position and time
    float mixValue = sin(vPosition.y * 0.5 + uTime) * 0.5 + 0.5;
    mixValue *= sin(vPosition.x * 0.3 + uTime * 0.7) * 0.5 + 0.5;
    
    // Add wave-based color mixing
    float wave = sin(vPosition.y * 2.0 + uTime * 3.0) * 0.3 + 0.7;
    mixValue *= wave;
    
    // Add random variation
    mixValue += vRandom * 0.1;
    
    // Create a third color for more complex transitions
    vec3 uColorC = vec3(0.2, 0.8, 0.4); // Green accent
    
    // Multi-color mixing
    vec3 colorAB = mix(uColorA, uColorB, mixValue);
    vec3 finalColor = mix(colorAB, uColorC, sin(uTime * 0.5) * 0.3 + 0.3);
    
    // Add brightness variation with wave patterns
    float brightness = sin(vUv.x * 10.0 + uTime * 2.0) * 0.1 + 0.9;
    brightness *= sin(vUv.y * 8.0 + uTime * 1.5) * 0.1 + 0.9;
    
    finalColor *= brightness;
    
    gl_FragColor = vec4(finalColor, 1.0);
} 