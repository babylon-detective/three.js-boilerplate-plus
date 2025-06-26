uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vNoise;

void main() {
    // Use noise for color mixing
    float mixValue = vNoise;
    
    // Add time-based variation
    mixValue += sin(uTime * 1.5 + vRandom * 6.28) * 0.3;
    
    // Create fire-like colors
    vec3 fireColor1 = vec3(1.0, 0.3, 0.1); // Red-orange
    vec3 fireColor2 = vec3(1.0, 0.8, 0.0); // Yellow-orange
    vec3 fireColor3 = vec3(0.8, 0.1, 0.0); // Deep red
    
    // Multi-step color mixing
    vec3 color1 = mix(fireColor1, fireColor2, mixValue);
    vec3 finalColor = mix(color1, fireColor3, sin(uTime + vNoise * 10.0) * 0.5 + 0.5);
    
    // Add intensity based on noise
    float intensity = vNoise * 0.5 + 0.5;
    finalColor *= intensity;
    
    // Add flickering effect
    float flicker = sin(uTime * 8.0 + vRandom * 20.0) * 0.1 + 0.9;
    finalColor *= flicker;
    
    gl_FragColor = vec4(finalColor, 1.0);
} 