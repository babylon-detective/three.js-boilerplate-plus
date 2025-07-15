uniform float uTime;
uniform float uElevation;
uniform float uRoughness;
uniform float uScale;
uniform vec3 uLandColor;
uniform vec3 uRockColor;
uniform float uIslandRadius;
uniform float uCoastSmoothness;
uniform float uSeaLevel;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vElevation;
varying float vSlope;
varying vec3 vWorldPosition;

// Noise functions for terrain generation
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    
    vec2 u = f * f * (3.0 - 2.0 * f);
    
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 0.0;
    
    for (int i = 0; i < 6; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec3 pos = position;
    
    // Generate terrain height using fractal noise
    vec2 noiseCoord = pos.xz * uScale * 0.1;
    
    // Multiple octaves of noise for dramatic volcanic terrain
    float height = fbm(noiseCoord) * uElevation;
    height += fbm(noiseCoord * 2.0) * uElevation * 0.6;
    height += fbm(noiseCoord * 4.0) * uElevation * 0.4;
    height += fbm(noiseCoord * 8.0) * uElevation * 0.2; // Extra detail
    
    // Add ridges for volcanic terrain
    float ridgeNoise = abs(noise(noiseCoord * 3.0) - 0.5) * 2.0;
    height += ridgeNoise * uElevation * 0.3;
    
    // Add some time-based variation for subtle animation
    height += sin(uTime * 0.1 + pos.x * 0.1) * cos(uTime * 0.1 + pos.z * 0.1) * uRoughness * 0.1;
    
    // Calculate distance from center for island falloff
    vec2 center = vec2(0.0, 0.0);
    float distanceFromCenter = length(pos.xz - center);
    
    // Island parameters controlled by uniforms
    float islandRadius = uIslandRadius;
    float coastSmoothness = uCoastSmoothness;
    float seaLevel = uSeaLevel;
    
    // Create dramatic volcanic island shape with deep underwater slopes
    float islandMask = 1.0 - smoothstep(islandRadius - coastSmoothness, islandRadius + coastSmoothness, distanceFromCenter);
    islandMask = pow(islandMask, 0.7); // Steeper falloff for more dramatic slopes
    
    // Apply height with volcanic island falloff
    float finalHeight = height * islandMask;
    
    // Create deep underwater slopes beyond the island
    float underwaterDepth = seaLevel;
    if (distanceFromCenter > islandRadius) {
        float deepWaterFactor = smoothstep(islandRadius, islandRadius * 2.0, distanceFromCenter);
        underwaterDepth = seaLevel - (deepWaterFactor * abs(seaLevel) * 4.0); // Much deeper edges
    }
    
    // Smooth transition from volcanic peaks to deep ocean floor
    finalHeight = mix(underwaterDepth, finalHeight, islandMask);
    
    pos.y += finalHeight;
    
    // Calculate slope for texture blending
    vec3 tangentX = vec3(1.0, (fbm(noiseCoord + vec2(0.01, 0.0)) - fbm(noiseCoord - vec2(0.01, 0.0))) * uElevation * 100.0, 0.0);
    vec3 tangentZ = vec3(0.0, (fbm(noiseCoord + vec2(0.0, 0.01)) - fbm(noiseCoord - vec2(0.0, 0.01))) * uElevation * 100.0, 1.0);
    vec3 calculatedNormal = normalize(cross(tangentZ, tangentX));
    
    // Pass data to fragment shader
    vPosition = pos;
    vNormal = calculatedNormal;
    vUv = uv;
    vElevation = height;
    vSlope = 1.0 - dot(calculatedNormal, vec3(0.0, 1.0, 0.0));
    
    // World position for lighting calculations
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    // Transform position
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
} 