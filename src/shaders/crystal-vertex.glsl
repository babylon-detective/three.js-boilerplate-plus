uniform float uTime;
uniform float uAmplitude;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying float vRandom;
varying float vCrystal;

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    
    // Create faceted crystal effect
    float facetFreq = 8.0;
    float angle = atan(modelPosition.z, modelPosition.x);
    float facetAngle = floor(angle * facetFreq / (2.0 * 3.14159)) * (2.0 * 3.14159) / facetFreq;
    
    // Apply faceting
    float radius = length(modelPosition.xz);
    modelPosition.x = cos(facetAngle) * radius;
    modelPosition.z = sin(facetAngle) * radius;
    
    // Add crystal growth animation
    float growth = sin(uTime * 1.5 + aRandom * 6.28) * 0.5 + 0.5;
    float heightFactor = (modelPosition.y + 0.5) / 1.0;
    
    // Apply growth effect - stronger at edges
    float edgeDistance = abs(radius - 0.3);
    float growthAmount = growth * uAmplitude * (1.0 + edgeDistance * 2.0);
    
    // Push vertices outward for crystal spikes
    vec3 direction = normalize(vec3(modelPosition.x, 0.0, modelPosition.z));
    modelPosition.xyz += direction * growthAmount * heightFactor;
    
    // Add vertical crystal segments
    float segments = sin(modelPosition.y * 10.0 + uTime * 0.5) * 0.1 + 1.0;
    modelPosition.x *= segments;
    modelPosition.z *= segments;
    
    // Store crystal value for fragment shader
    vCrystal = growth;
    
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    gl_Position = projectedPosition;
    
    vUv = uv;
    vPosition = modelPosition.xyz;
    vRandom = aRandom;
} 