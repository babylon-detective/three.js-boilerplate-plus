uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vNoise;

// Simple noise function
float noise(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 54.53))) * 43758.5453);
}

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    
    // Create noise-based displacement
    vec3 noisePos = modelPosition.xyz * 2.0 + uTime * 0.5;
    float noiseValue = noise(noisePos);
    vNoise = noiseValue;
    
    // Apply noise displacement along normal
    vec3 displaced = modelPosition.xyz + normal * noiseValue * uAmplitude;
    modelPosition = vec4(displaced, 1.0);
    
    // Add time-based pulsing
    float pulse = sin(uTime * 2.0 + aRandom * 10.0) * 0.1;
    modelPosition.xyz += normal * pulse * uAmplitude;
    
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    gl_Position = projectedPosition;
    
    vUv = uv;
    vPosition = modelPosition.xyz;
    vRandom = aRandom;
} 