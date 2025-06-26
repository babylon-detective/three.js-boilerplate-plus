uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vCrystal;

void main() {
    // Use crystal value for color mixing
    float mixValue = vCrystal;
    
    // Add faceted lighting effect
    float facetLight = abs(sin(vUv.x * 16.0) * sin(vUv.y * 12.0));
    mixValue = mix(mixValue, facetLight, 0.6);
    
    // Create crystal/amber colors
    vec3 crystalColor1 = vec3(1.0, 0.8, 0.2); // Golden amber
    vec3 crystalColor2 = vec3(1.0, 0.6, 0.0); // Deep amber
    vec3 crystalColor3 = vec3(1.0, 1.0, 0.4); // Light gold
    
    // Multi-color crystal mixing
    vec3 color1 = mix(crystalColor1, crystalColor2, mixValue);
    vec3 finalColor = mix(color1, crystalColor3, sin(uTime * 1.2 + vCrystal * 6.28) * 0.5 + 0.5);
    
    // Add crystal refraction effect
    float refraction = sin(vUv.x * 20.0 + uTime * 2.0) * sin(vUv.y * 15.0 + uTime * 1.5) * 0.3 + 0.7;
    finalColor *= refraction;
    
    // Add internal crystal glow
    float innerGlow = 1.0 - abs(vUv.x - 0.5) * abs(vUv.y - 0.5) * 4.0;
    innerGlow = pow(innerGlow, 3.0) * 0.4 + 0.6;
    finalColor *= innerGlow;
    
    // Add crystal sparkle
    float sparkle = sin(vUv.x * 50.0 + uTime * 8.0) * sin(vUv.y * 40.0 + uTime * 6.0);
    sparkle = smoothstep(0.8, 1.0, sparkle) * 0.5 + 1.0;
    finalColor *= sparkle;
    
    gl_FragColor = vec4(finalColor, 1.0);
} 