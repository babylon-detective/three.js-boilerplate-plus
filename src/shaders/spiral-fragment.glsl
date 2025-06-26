uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vSpiral;

void main() {
    // Use spiral value for color mixing
    float mixValue = vSpiral;
    
    // Add radial gradient
    float radial = length(vUv - 0.5) * 2.0;
    mixValue += radial * 0.3;
    
    // Create ocean-like colors
    vec3 oceanColor1 = vec3(0.0, 0.8, 0.4); // Sea green
    vec3 oceanColor2 = vec3(0.2, 1.0, 0.8); // Cyan
    vec3 oceanColor3 = vec3(0.0, 0.4, 0.8); // Deep blue
    
    // Multi-color spiral mixing
    vec3 color1 = mix(oceanColor1, oceanColor2, mixValue);
    vec3 finalColor = mix(color1, oceanColor3, sin(uTime * 0.8 + vSpiral * 6.28) * 0.5 + 0.5);
    
    // Add spiral bands
    float bands = sin(vSpiral * 12.0 + uTime * 3.0) * 0.2 + 0.8;
    finalColor *= bands;
    
    // Add shimmer effect
    float shimmer = sin(vUv.x * 20.0 + uTime * 4.0) * sin(vUv.y * 20.0 + uTime * 3.0) * 0.1 + 0.9;
    finalColor *= shimmer;
    
    gl_FragColor = vec4(finalColor, 1.0);
} 