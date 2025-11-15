uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vSpiral;

void main() {
    // Use local position for displacement calculations (prevents stretching when object moves)
    // Scale up local coordinates to match original world-space effect intensity
    vec3 localPos = position * 10.0; // Scale factor to restore original intensity
    
    // Calculate distance from center for spiral effect
    float distance = length(localPos.xz);
    
    // Create spiral rotation (restored original intensity)
    float angle = atan(localPos.z, localPos.x);
    float spiralAngle = angle + distance * 2.0 + uTime * 2.0;
    
    // Apply spiral transformation
    float spiralRadius = distance + sin(localPos.y * 4.0 + uTime) * uAmplitude * 0.3;
    localPos.x = cos(spiralAngle) * spiralRadius;
    localPos.z = sin(spiralAngle) * spiralRadius;
    
    // Add vertical wave
    localPos.y += sin(distance * 3.0 + uTime * 1.5) * uAmplitude * 0.5;
    
    // Scale back down for proper local space displacement
    localPos /= 10.0;
    
    // Transform to world space only at the end
    vec4 modelPosition = modelMatrix * vec4(localPos, 1.0);
    
    // Store spiral value for fragment shader
    vSpiral = sin(spiralAngle + uTime) * 0.5 + 0.5;
    
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    gl_Position = projectedPosition;
    
    vUv = uv;
    vPosition = modelPosition.xyz;
    vRandom = aRandom;
} 