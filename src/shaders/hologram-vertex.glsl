uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vHolo;
varying vec3 vNormal;

void main() {
    // Use local position for displacement calculations (prevents stretching when object moves)
    // Scale up for more dramatic effect (restored original intensity)
    vec3 localPos = position * 5.0;
    
    // Create holographic distortion (using scaled local coordinates for original intensity)
    float distortion = sin(localPos.x * 3.0 + uTime * 2.0) * sin(localPos.y * 4.0 + uTime * 1.5) * sin(localPos.z * 2.5 + uTime * 1.8);
    
    // Apply distortion along normals (restored original intensity)
    vec3 displaced = localPos + normal * distortion * uAmplitude * 0.4; // Increased from 0.2
    localPos = displaced;
    
    // Create scanning lines effect (restored original intensity)
    float scanLines = sin(localPos.y * 20.0 + uTime * 10.0) * 0.1; // Increased from 0.05
    localPos.y += scanLines;
    
    // Add holographic flickering (restored original intensity)
    float flicker = sin(uTime * 15.0 + aRandom * 10.0) * 0.05 + 0.95; // Increased variation
    localPos.xyz *= flicker;
    
    // Create edge glow displacement (restored original intensity)
    float edgeGlow = sin(uTime * 3.0) * 0.5 + 0.5;
    localPos.xyz += normal * edgeGlow * uAmplitude * 0.2; // Increased from 0.1
    
    // Scale back down for proper local space displacement
    localPos /= 5.0;
    
    // Transform to world space only at the end
    vec4 modelPosition = modelMatrix * vec4(localPos, 1.0);
    
    // Store hologram value for fragment shader
    vHolo = distortion * 0.5 + 0.5;
    vNormal = normal;
    
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    gl_Position = projectedPosition;
    
    vUv = uv;
    vPosition = modelPosition.xyz;
    vRandom = aRandom;
} 