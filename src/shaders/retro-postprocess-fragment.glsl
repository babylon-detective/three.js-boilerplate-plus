uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uPixelSize;
uniform float uColorLevels;
uniform float uDitherAmount;
uniform float uContrast;
uniform float uSaturation;

varying vec2 vUv;

// Dithering pattern (Bayer 4x4)
float ditherPattern(vec2 coord) {
    int x = int(mod(coord.x, 4.0));
    int y = int(mod(coord.y, 4.0));
    
    // Bayer 4x4 matrix
    float bayer[16];
    bayer[0] = 0.0 / 16.0;  bayer[1] = 8.0 / 16.0;  bayer[2] = 2.0 / 16.0;  bayer[3] = 10.0 / 16.0;
    bayer[4] = 12.0 / 16.0; bayer[5] = 4.0 / 16.0;  bayer[6] = 14.0 / 16.0; bayer[7] = 6.0 / 16.0;
    bayer[8] = 3.0 / 16.0;  bayer[9] = 11.0 / 16.0; bayer[10] = 1.0 / 16.0; bayer[11] = 9.0 / 16.0;
    bayer[12] = 15.0 / 16.0; bayer[13] = 7.0 / 16.0; bayer[14] = 13.0 / 16.0; bayer[15] = 5.0 / 16.0;
    
    return bayer[y * 4 + x];
}

// Quantize/posterize color
vec3 quantizeColor(vec3 color, float levels) {
    return floor(color * levels) / levels;
}

// Pixelate coordinates
vec2 pixelate(vec2 uv, vec2 resolution, float pixelSize) {
    vec2 pixelScale = resolution / pixelSize;
    return floor(uv * pixelScale) / pixelScale;
}

void main() {
    // Pixelate the UV coordinates
    vec2 pixelatedUv = pixelate(vUv, uResolution, uPixelSize);
    
    // Sample the texture
    vec4 color = texture2D(tDiffuse, pixelatedUv);
    
    // Apply contrast
    color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
    
    // Apply saturation
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(gray), color.rgb, uSaturation);
    
    // Quantize/posterize colors
    color.rgb = quantizeColor(color.rgb, uColorLevels);
    
    // Apply dithering
    vec2 ditherCoord = gl_FragCoord.xy;
    float dither = ditherPattern(ditherCoord) - 0.5;
    color.rgb += dither * uDitherAmount / uColorLevels;
    
    // Clamp to valid range
    color.rgb = clamp(color.rgb, 0.0, 1.0);
    
    gl_FragColor = color;
}

