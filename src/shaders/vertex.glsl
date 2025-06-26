uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    
    // Enhanced wave animation with multiple frequencies
    float wave1 = sin(modelPosition.x * 4.0 + uTime) * uAmplitude;
    float wave2 = sin(modelPosition.z * 2.0 + uTime * 0.5) * uAmplitude * 0.5;
    float wave3 = sin(modelPosition.x * modelPosition.z * 0.5 + uTime * 2.0) * uAmplitude * 0.3;
    
    modelPosition.y += wave1 + wave2 + wave3;
    
    // Add random offset
    modelPosition.y += aRandom * 0.1;
    
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    gl_Position = projectedPosition;
    
    // Pass to fragment shader
    vUv = uv;
    vPosition = modelPosition.xyz;
    vRandom = aRandom;
} 