uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vHolo;
varying vec3 vNormal;

void main() {
    // Create iridescent color shift
    float iridescence = sin(vHolo * 6.28 + uTime) * 0.5 + 0.5;
    
    // Add fresnel-like effect
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
    
    // Create holographic colors (iridescent spectrum)
    vec3 holoColor1 = vec3(1.0, 0.2, 0.8); // Magenta
    vec3 holoColor2 = vec3(0.2, 1.0, 0.8); // Cyan
    vec3 holoColor3 = vec3(0.8, 1.0, 0.2); // Yellow-green
    vec3 holoColor4 = vec3(0.8, 0.2, 1.0); // Purple
    
    // Multi-step color mixing for iridescence
    vec3 color1 = mix(holoColor1, holoColor2, iridescence);
    vec3 color2 = mix(holoColor3, holoColor4, 1.0 - iridescence);
    vec3 finalColor = mix(color1, color2, sin(uTime * 0.8 + vHolo * 4.0) * 0.5 + 0.5);
    
    // Apply fresnel effect
    finalColor = mix(finalColor * 0.3, finalColor, fresnel);
    
    // Add scanning lines
    float scanLines = sin(vUv.y * 100.0 + uTime * 20.0) * 0.1 + 0.9;
    finalColor *= scanLines;
    
    // Add holographic interference
    float interference = sin(vUv.x * 50.0 + uTime * 8.0) * sin(vUv.y * 30.0 + uTime * 6.0) * 0.1 + 0.9;
    finalColor *= interference;
    
    // Add transparency with edge glow
    float alpha = fresnel * 0.7 + 0.3;
    
    // Add flickering effect
    float flicker = sin(uTime * 12.0 + vRandom * 20.0) * 0.1 + 0.9;
    finalColor *= flicker;
    
    gl_FragColor = vec4(finalColor, alpha);
} 