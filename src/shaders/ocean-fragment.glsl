uniform float uTime;
uniform vec3 uWaterColor;
uniform vec3 uDeepWaterColor;
uniform vec3 uFoamColor;
uniform float uTransparency;
uniform float uReflectionStrength;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying float vRandom;
varying float vWaveHeight;
varying vec3 vNormal;
varying float vFoam;

// Fresnel effect for water surface
float fresnel(vec3 viewDir, vec3 normal, float power) {
    return pow(1.0 - max(0.0, dot(viewDir, normal)), power);
}

// Simulated caustics pattern
float caustics(vec2 uv, float time) {
    vec2 p = uv * 8.0;
    float c = 0.0;
    
    // Multiple overlapping caustic patterns
    for(int i = 0; i < 3; i++) {
        float fi = float(i);
        vec2 q = p + vec2(cos(time * 0.3 + fi), sin(time * 0.2 + fi)) * 0.5;
        c += sin(q.x + cos(q.y + time * 0.4)) * sin(q.y + cos(q.x + time * 0.3));
    }
    
    return c * 0.1 + 0.5;
}

// Water depth calculation
float waterDepth(vec3 worldPos) {
    // Simulate depth based on distance from "shore" (can be customized)
    float depth = clamp(length(worldPos.xz) * 0.02, 0.0, 10.0);
    return depth;
}

void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vNormal);
    
    // Calculate water depth
    float depth = waterDepth(vWorldPosition);
    
    // Base water color mixing based on depth
    vec3 shallowColor = uWaterColor;
    vec3 deepColor = uDeepWaterColor;
    vec3 baseColor = mix(shallowColor, deepColor, smoothstep(0.0, 5.0, depth));
    
    // Fresnel effect for reflections
    float fresnelFactor = fresnel(viewDirection, normal, 2.0);
    
    // Sun reflection (specular)
    vec3 sunReflection = normalize(reflect(-uSunDirection, normal));
    float sunSpec = pow(max(0.0, dot(viewDirection, sunReflection)), 64.0);
    vec3 sunHighlight = uSunColor * sunSpec * uReflectionStrength;
    
    // Sky reflection (simplified)
    vec3 skyReflection = vec3(0.4, 0.7, 1.0); // Light blue sky color
    vec3 reflectedColor = skyReflection * fresnelFactor * uReflectionStrength;
    
    // Caustics effect
    float causticsPattern = caustics(vUv + vWorldPosition.xz * 0.1, uTime);
    vec3 causticsColor = vec3(0.8, 1.0, 1.0) * causticsPattern * 0.3;
    
    // Foam calculations
    float foamMask = smoothstep(0.4, 0.8, vFoam);
    vec3 foamEffect = uFoamColor * foamMask;
    
    // Wave crest foam (additional foam on wave peaks)
    float crestFoam = smoothstep(0.3, 0.6, vWaveHeight) * 0.8;
    foamEffect += uFoamColor * crestFoam;
    
    // Underwater light scattering
    float scatter = max(0.0, 1.0 - depth * 0.1);
    vec3 scatterColor = vec3(0.0, 0.4, 0.6) * scatter * 0.2;
    
    // Combine all effects
    vec3 finalColor = baseColor;
    finalColor = mix(finalColor, reflectedColor, fresnelFactor);
    finalColor += sunHighlight;
    finalColor += causticsColor * (1.0 - foamMask);
    finalColor += scatterColor;
    finalColor = mix(finalColor, foamEffect, foamMask);
    
    // Add some subsurface scattering for realism
    float subsurface = pow(max(0.0, dot(normal, uSunDirection)), 0.5) * 0.3;
    finalColor += vec3(0.0, 0.3, 0.4) * subsurface;
    
    // Distance-based fog/haze
    float distance = length(vWorldPosition - cameraPosition);
    float fog = 1.0 - exp(-distance * 0.001);
    vec3 fogColor = vec3(0.7, 0.8, 0.9);
    finalColor = mix(finalColor, fogColor, fog * 0.3);
    
    // Alpha based on depth and fresnel
    float alpha = mix(uTransparency, 1.0, fresnelFactor);
    alpha = mix(alpha, 1.0, foamMask); // Foam is opaque
    
    // Add some animation to the overall color
    float timeVariation = sin(uTime * 0.1) * 0.05 + 0.95;
    finalColor *= timeVariation;
    
    gl_FragColor = vec4(finalColor, alpha);
} 