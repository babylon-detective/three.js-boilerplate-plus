uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    
    // Add wave animation
    modelPosition.y += sin(modelPosition.x * 4.0 + uTime) * uAmplitude;
    modelPosition.y += sin(modelPosition.z * 2.0 + uTime * 0.5) * uAmplitude * 0.5;
    
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