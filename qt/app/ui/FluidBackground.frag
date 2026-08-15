#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec4 cA;
    vec4 cB;
    vec4 cC;
    vec4 cD;
    float time;
    float aspect;
};

vec3 paletteColor(int index) {
    if (index == 0) return cA.rgb;
    if (index == 1) return cB.rgb;
    if (index == 2) return cC.rgb;
    return cD.rgb;
}

vec2 blobBase(int index) {
    if (index == 0) return vec2(0.18, 0.25);
    if (index == 1) return vec2(0.78, 0.20);
    if (index == 2) return vec2(0.67, 0.78);
    return vec2(0.20, 0.78);
}

vec2 blobRadius(int index, float phase) {
    vec2 radius;
    if (index == 0) radius = vec2(0.30, 0.36);
    else if (index == 1) radius = vec2(0.34, 0.31);
    else if (index == 2) radius = vec2(0.36, 0.34);
    else radius = vec2(0.32, 0.30);
    radius *= vec2(1.0 + sin(time * 0.80 + phase) * 0.18,
                   1.0 + cos(time * 0.67 + phase) * 0.18);
    return radius;
}

void main() {
    vec2 uv = qt_TexCoord0;

    // Two low-frequency coordinate waves continuously fold the field. This
    // deforms the shared liquid boundary instead of merely moving circles.
    vec2 warped = uv + vec2(
        sin(uv.y * 8.4 + time * 1.4) * 0.040
            + sin(uv.y * 21.0 - time * 0.9) * 0.014,
        cos(uv.x * 7.2 - time * 1.1) * 0.040
            + sin(uv.x * 17.0 + time * 0.75) * 0.014
    );

    float field = 0.0;
    float weightSum = 0.0;
    vec3 weightedColor = vec3(0.0);

    for (int index = 0; index < 4; ++index) {
        float phase = float(index) * 1.73 + 0.2;
        vec2 center = blobBase(index);
        center.x += sin(time * (0.72 + float(index) * 0.035) + phase) * 0.15
                  + cos(time * 0.31 + phase) * 0.055;
        center.y += cos(time * (0.58 + float(index) * 0.045) + phase) * 0.15
                  + sin(time * 0.27 + phase) * 0.055;

        vec2 delta = (warped - center) / blobRadius(index, phase);
        float influence = 1.0 / (1.0 + dot(delta, delta) * 2.6);
        float weight = influence * influence;
        field += influence;
        weightSum += weight;
        weightedColor += paletteColor(index) * weight;
    }

    field += max(0.0, sin((warped.x * 5.6 + warped.y * 4.8)
                         * 3.14159265 + time * 2.2) * 0.055);

    vec3 tint = weightedColor / max(weightSum, 0.0001);
    float softBody = smoothstep(0.30, 0.78, field);
    float denseBody = smoothstep(0.62, 1.34, field);
    float rim = smoothstep(0.34, 0.54, field)
              * (1.0 - smoothstep(0.72, 1.08, field));

    float centerDistance = distance(uv, vec2(0.5, 0.43));
    float centerGlow = 1.0 - smoothstep(0.06, 0.72, centerDistance);
    vec3 base = mix(vec3(0.012, 0.020, 0.048),
                    vec3(0.070, 0.105, 0.190), centerGlow * 0.72);
    vec3 liquid = clamp(tint * (0.82 + denseBody * 0.20)
                        + vec3(1.0) * rim * 0.10, 0.0, 1.0);
    float liquidAlpha = softBody * 0.58 + denseBody * 0.14;

    // Screen blend retains the original dark atmosphere while making the
    // connected metaball body and its necks clearly readable.
    vec3 color = 1.0 - (1.0 - base) * (1.0 - liquid * liquidAlpha);
    float vignette = smoothstep(0.36, 0.78, distance(uv, vec2(0.5)));
    color *= mix(1.0, 0.58, vignette);
    fragColor = vec4(color, 1.0) * qt_Opacity;
}
