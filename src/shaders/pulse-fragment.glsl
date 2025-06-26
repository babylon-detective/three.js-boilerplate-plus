uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vPulse;

void main() {
    // Use pulse value for color mixing
    float mixValue = vPulse;
    
    // Add vertical gradient
    float gradient = vUv.y;
    mixValue = mix(mixValue, gradient, 0.5);
    
    // Create electric/plasma colors
    vec3 plasmaColor1 = vec3(0.2, 0.3, 1.0); // Electric blue
    vec3 plasmaColor2 = vec3(0.8, 0.2, 1.0); // Purple
    vec3 plasmaColor3 = vec3(0.0, 0.8, 1.0); // Cyan
    
    // Multi-color pulse mixing
    vec3 color1 = mix(plasmaColor1, plasmaColor2, mixValue);
    vec3 finalColor = mix(color1, plasmaColor3, sin(uTime * 2.0 + vPulse * 3.14) * 0.5 + 0.5);
    
    // Add electric intensity
    float intensity = vPulse * 0.7 + 0.3;
    finalColor *= intensity;
    
    // Add electric arcs effect
    float arcs = sin(vUv.y * 30.0 + uTime * 6.0) * sin(vUv.x * 20.0 + uTime * 4.0);
    arcs = smoothstep(0.7, 1.0, arcs) * 0.3 + 1.0;
    finalColor *= arcs;
    
    // Add glow effect
    float glow = 1.0 - length(vUv - 0.5) * 2.0;
    glow = pow(glow, 2.0) * 0.5 + 0.5;
    finalColor *= glow;
    
    gl_FragColor = vec4(finalColor, 1.0);
} 