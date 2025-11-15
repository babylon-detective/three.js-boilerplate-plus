uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vPulse;

void main() {
    // Use local position for displacement calculations (prevents stretching when object moves)
    vec3 localPos = position;
    
    // Create pulsing effect based on height
    float heightFactor = (localPos.y + 0.5) / 1.0; // Normalize height
    float pulse = sin(uTime * 3.0) * 0.5 + 0.5;
    
    // Stronger pulse at the top, weaker at bottom (restored original intensity)
    float scaleFactor = 1.0 + pulse * uAmplitude * heightFactor * 1.5; // Increased multiplier
    
    // Apply pulse to x and z coordinates
    localPos.x *= scaleFactor;
    localPos.z *= scaleFactor;
    
    // Add vertical breathing (restored original intensity)
    localPos.y += sin(uTime * 2.0 + aRandom * 6.28) * uAmplitude * 0.5; // Increased from 0.3
    
    // Add secondary pulse for complexity (restored original intensity)
    float secondaryPulse = sin(uTime * 5.0 + heightFactor * 3.14) * 0.3 + 0.7; // Increased variation
    localPos.xyz *= secondaryPulse;
    
    // Transform to world space only at the end
    vec4 modelPosition = modelMatrix * vec4(localPos, 1.0);
    
    // Store pulse value for fragment shader
    vPulse = pulse;
    
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    gl_Position = projectedPosition;
    
    vUv = uv;
    vPosition = modelPosition.xyz;
    vRandom = aRandom;
} 