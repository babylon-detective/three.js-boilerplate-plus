uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vPulse;

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    
    // Create pulsing effect based on height
    float heightFactor = (modelPosition.y + 0.5) / 1.0; // Normalize height
    float pulse = sin(uTime * 3.0) * 0.5 + 0.5;
    
    // Stronger pulse at the top, weaker at bottom
    float scaleFactor = 1.0 + pulse * uAmplitude * heightFactor;
    
    // Apply pulse to x and z coordinates
    modelPosition.x *= scaleFactor;
    modelPosition.z *= scaleFactor;
    
    // Add vertical breathing
    modelPosition.y += sin(uTime * 2.0 + aRandom * 6.28) * uAmplitude * 0.3;
    
    // Add secondary pulse for complexity
    float secondaryPulse = sin(uTime * 5.0 + heightFactor * 3.14) * 0.2 + 0.8;
    modelPosition.xyz *= secondaryPulse;
    
    // Store pulse value for fragment shader
    vPulse = pulse;
    
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    gl_Position = projectedPosition;
    
    vUv = uv;
    vPosition = modelPosition.xyz;
    vRandom = aRandom;
} 