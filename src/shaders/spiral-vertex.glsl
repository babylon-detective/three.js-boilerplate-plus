uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vSpiral;

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    
    // Calculate distance from center for spiral effect
    float distance = length(modelPosition.xz);
    
    // Create spiral rotation
    float angle = atan(modelPosition.z, modelPosition.x);
    float spiralAngle = angle + distance * 2.0 + uTime * 2.0;
    
    // Apply spiral transformation
    float spiralRadius = distance + sin(modelPosition.y * 4.0 + uTime) * uAmplitude * 0.3;
    modelPosition.x = cos(spiralAngle) * spiralRadius;
    modelPosition.z = sin(spiralAngle) * spiralRadius;
    
    // Add vertical wave
    modelPosition.y += sin(distance * 3.0 + uTime * 1.5) * uAmplitude * 0.5;
    
    // Store spiral value for fragment shader
    vSpiral = sin(spiralAngle + uTime) * 0.5 + 0.5;
    
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    gl_Position = projectedPosition;
    
    vUv = uv;
    vPosition = modelPosition.xyz;
    vRandom = aRandom;
} 