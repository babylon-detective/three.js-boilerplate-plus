uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vCrystal;

void main() {
    // Use local position for displacement calculations (prevents stretching when object moves)
    vec3 localPos = position;
    
    // Create faceted crystal effect
    float facetFreq = 8.0;
    float angle = atan(localPos.z, localPos.x);
    float facetAngle = floor(angle * facetFreq / (2.0 * 3.14159)) * (2.0 * 3.14159) / facetFreq;
    
    // Apply faceting
    float radius = length(localPos.xz);
    localPos.x = cos(facetAngle) * radius;
    localPos.z = sin(facetAngle) * radius;
    
    // Add crystal growth animation
    float growth = sin(uTime * 1.5 + aRandom * 6.28) * 0.5 + 0.5;
    float heightFactor = (localPos.y + 0.5) / 1.0;
    
    // Apply growth effect - stronger at edges (restored original intensity)
    float edgeDistance = abs(radius - 0.3);
    float growthAmount = growth * uAmplitude * (1.0 + edgeDistance * 3.0); // Increased from 2.0
    
    // Push vertices outward for crystal spikes (restored original intensity)
    vec3 direction = normalize(vec3(localPos.x, 0.0, localPos.z));
    localPos.xyz += direction * growthAmount * heightFactor * 1.5; // Increased multiplier
    
    // Add vertical crystal segments (restored original intensity)
    float segments = sin(localPos.y * 10.0 + uTime * 0.5) * 0.2 + 0.8; // Increased variation
    localPos.x *= segments;
    localPos.z *= segments;
    
    // Transform to world space only at the end
    vec4 modelPosition = modelMatrix * vec4(localPos, 1.0);
    
    // Store crystal value for fragment shader
    vCrystal = growth;
    
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    gl_Position = projectedPosition;
    
    vUv = uv;
    vPosition = modelPosition.xyz;
    vRandom = aRandom;
} 