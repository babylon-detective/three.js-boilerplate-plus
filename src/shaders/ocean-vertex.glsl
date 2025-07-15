uniform float uTime;
uniform float uAmplitude;
uniform vec2 uWindDirection;
uniform float uWindStrength;
uniform float uWaveLength;
uniform float uWaveSpeed;
attribute float aRandom;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying float vRandom;
varying float vWaveHeight;
varying vec3 vNormal;
varying float vFoam;

// Improved noise function for more realistic waves
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
    return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec3 worldPos = modelPosition.xyz;
    
    // Multiple wave layers for realistic ocean
    float time = uTime * uWaveSpeed;
    
    // Large waves (swell)
    float wave1 = sin(worldPos.x * 0.02 + worldPos.z * 0.01 + time * 0.5) * uAmplitude * 2.0;
    wave1 += sin(worldPos.x * 0.03 + worldPos.z * 0.02 + time * 0.3) * uAmplitude * 1.5;
    
    // Medium waves
    float wave2 = sin(worldPos.x * 0.1 + worldPos.z * 0.05 + time * 1.2) * uAmplitude * 0.8;
    wave2 += sin(worldPos.x * 0.15 + worldPos.z * 0.08 + time * 0.9) * uAmplitude * 0.6;
    
    // Small waves (chop)
    float wave3 = sin(worldPos.x * 0.4 + worldPos.z * 0.3 + time * 2.0) * uAmplitude * 0.3;
    wave3 += sin(worldPos.x * 0.6 + worldPos.z * 0.4 + time * 1.8) * uAmplitude * 0.2;
    
    // Wind-driven waves
    vec2 windPos = worldPos.xz + uWindDirection * uWindStrength * time * 0.1;
    float windWave = snoise(vec3(windPos * 0.05, time * 0.2)) * uAmplitude * 1.2;
    
    // Combine all waves
    float totalWave = wave1 + wave2 + wave3 + windWave;
    
    // Add some noise for more natural look
    float noise = snoise(vec3(worldPos.xz * 0.2, time * 0.1)) * uAmplitude * 0.4;
    totalWave += noise;
    
    // Apply wave height
    modelPosition.y += totalWave;
    vWaveHeight = totalWave;
    
    // Calculate foam based on wave steepness
    float foam = max(0.0, totalWave * 0.3);
    foam += smoothstep(0.5, 1.0, abs(sin(worldPos.x * 0.3 + time * 1.5))) * 0.3;
    vFoam = foam;
    
    // Calculate accurate normal by sampling height at neighboring points
    float offset = 0.1;
    
    // Sample height at 4 neighboring points using the same wave calculation
    vec3 posL = vec3(worldPos.x - offset, 0.0, worldPos.z);
    vec3 posR = vec3(worldPos.x + offset, 0.0, worldPos.z);
    vec3 posD = vec3(worldPos.x, 0.0, worldPos.z - offset);
    vec3 posU = vec3(worldPos.x, 0.0, worldPos.z + offset);
    
    // Calculate height at each neighboring point (same wave formula as main calculation)
    float hL = sin(posL.x * 0.02 + posL.z * 0.01 + time * 0.5) * uAmplitude * 2.0;
    hL += sin(posL.x * 0.03 + posL.z * 0.02 + time * 0.3) * uAmplitude * 1.5;
    hL += sin(posL.x * 0.1 + posL.z * 0.05 + time * 1.2) * uAmplitude * 0.8;
    
    float hR = sin(posR.x * 0.02 + posR.z * 0.01 + time * 0.5) * uAmplitude * 2.0;
    hR += sin(posR.x * 0.03 + posR.z * 0.02 + time * 0.3) * uAmplitude * 1.5;
    hR += sin(posR.x * 0.1 + posR.z * 0.05 + time * 1.2) * uAmplitude * 0.8;
    
    float hD = sin(posD.x * 0.02 + posD.z * 0.01 + time * 0.5) * uAmplitude * 2.0;
    hD += sin(posD.x * 0.03 + posD.z * 0.02 + time * 0.3) * uAmplitude * 1.5;
    hD += sin(posD.x * 0.1 + posD.z * 0.05 + time * 1.2) * uAmplitude * 0.8;
    
    float hU = sin(posU.x * 0.02 + posU.z * 0.01 + time * 0.5) * uAmplitude * 2.0;
    hU += sin(posU.x * 0.03 + posU.z * 0.02 + time * 0.3) * uAmplitude * 1.5;
    hU += sin(posU.x * 0.1 + posU.z * 0.05 + time * 1.2) * uAmplitude * 0.8;
    
    // Calculate normal from height differences
    vec3 normal = normalize(vec3(hL - hR, 2.0 * offset, hD - hU));
    vNormal = normalMatrix * normal;
    
    // Transform position
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;
    
    // Set varying values
    vUv = uv;
    vPosition = modelPosition.xyz;
    vWorldPosition = worldPos;
    vRandom = aRandom;
} 