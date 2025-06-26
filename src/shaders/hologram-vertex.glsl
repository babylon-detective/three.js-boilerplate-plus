uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vHolo;
varying vec3 vNormal;

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    
    // Create holographic distortion
    float distortion = sin(modelPosition.x * 3.0 + uTime * 2.0) * sin(modelPosition.y * 4.0 + uTime * 1.5) * sin(modelPosition.z * 2.5 + uTime * 1.8);
    
    // Apply distortion along normals
    vec3 displaced = modelPosition.xyz + normal * distortion * uAmplitude * 0.2;
    modelPosition = vec4(displaced, 1.0);
    
    // Create scanning lines effect
    float scanLines = sin(modelPosition.y * 20.0 + uTime * 10.0) * 0.05;
    modelPosition.y += scanLines;
    
    // Add holographic flickering
    float flicker = sin(uTime * 15.0 + aRandom * 10.0) * 0.02 + 1.0;
    modelPosition.xyz *= flicker;
    
    // Create edge glow displacement
    float edgeGlow = sin(uTime * 3.0) * 0.5 + 0.5;
    modelPosition.xyz += normal * edgeGlow * uAmplitude * 0.1;
    
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