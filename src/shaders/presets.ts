// Standard preset fragment shaders supported in Phira extra.json

export const PRESET_SHADERS: Record<string, string> = {
  chromatic: `
precision mediump float;

varying lowp vec2 uv;
uniform sampler2D screenTexture;

uniform float sampleCount; // %3% int 1..64
uniform float power; // %0.01%

vec3 chromatic_slice(float t) {
  vec3 res = vec3(1.0 - t, 1.0 - abs(t - 1.0), t - 1.0);
  return max(res, 0.0);
}

void main() {
  vec3 sum = vec3(0.0);
  vec3 c = vec3(0.0);
  vec2 offset = (uv - vec2(0.5)) * vec2(1.0, -1.0);
  int sample_count = int(sampleCount);
  for (int i = 0; i < 64; ++i) {
    if (i >= sample_count) break;
    float t = 2.0 * float(i) / float(sample_count - 1);
    vec3 slice = vec3(1.0 - t, 1.0 - abs(t - 1.0), t - 1.0);
    slice = max(slice, 0.0);
    sum += slice;
    vec2 slice_offset = (t - 1.0) * power * offset;
    c += slice * texture2D(screenTexture, uv + slice_offset).rgb;
  }
  gl_FragColor = vec4(c / sum, 1.0);
}
`,

  radialBlur: `
precision mediump float;

varying lowp vec2 uv;
uniform sampler2D screenTexture;

uniform float centerX; // %0.5% 0..1
uniform float centerY; // %0.5% 0..1
uniform float power; // %0.01% 0..1
uniform float sampleCount; // %6% int 1..64

void main() {
  vec2 direction = uv - vec2(centerX, centerY);
  vec3 c = vec3(0.0);
  float f = 1.0 / sampleCount;
  for (float i = 0.0; i < 64.0; ++i) {
    if (i >= sampleCount) break;
    c += texture2D(screenTexture, uv - power * direction * i).rgb * f;
  }
  gl_FragColor = vec4(c, 1.0);
}
`,

  vignette: `
precision mediump float;

varying lowp vec2 uv;
uniform vec2 screenSize;
uniform sampler2D screenTexture;

uniform vec4 color; // %0.0, 0.0, 0.0, 1.0%
uniform float extend; // %0.25% 0..1
uniform float radius; // %15.0%

void main() {
  vec2 new_uv = uv * (1.0 - uv.yx);
  float vig = new_uv.x * new_uv.y * radius;
  vig = pow(vig, extend);
  gl_FragColor = mix(color, texture2D(screenTexture, uv), vig);
}
`,

  circleBlur: `
precision mediump float;

varying lowp vec2 uv;
uniform vec2 screenSize;
uniform sampler2D screenTexture;

uniform float size; // %10.0%

void main() {
  vec4 c = texture2D(screenTexture, uv);
  float max_length = dot(c, c);
  vec2 pixel_size = 1.0 / screenSize;
  for (int x = -30; x <= 30; ++x) {
    if (float(x) < -size || float(x) > size) continue;
    for (int y = -30; y <= 30; ++y) {
      if (float(y) < -size || float(y) > size) continue;
      if (float(x * x + y * y) > size * size) continue;
      vec4 new_c = texture2D(screenTexture, uv + pixel_size * vec2(float(x), float(y)));
      float new_length = dot(new_c, new_c);
      if (new_length > max_length) {
        max_length = new_length;
        c = new_c;
      }
    }
  }
  gl_FragColor = c;
}
`,

  fisheye: `
precision mediump float;

varying lowp vec2 uv;
uniform vec2 screenSize;
uniform sampler2D screenTexture;

uniform float power; // %-0.1%

void main() {
  vec2 p = vec2(uv.x, uv.y * screenSize.y / screenSize.x);
  float aspect = screenSize.x / screenSize.y;
  vec2 m = vec2(0.5, 0.5 / aspect);
  vec2 d = p - m;
  float r = sqrt(dot(d, d));

  float new_power = (2.0 * 3.14159265359 / (2.0 * sqrt(dot(m, m)))) * power;
  float bind = new_power > 0.0 ? sqrt(dot(m, m)) : (aspect < 1.0 ? m.x : m.y);

  vec2 nuv;
  if (new_power > 0.0)
    nuv = m + normalize(d) * tan(r * new_power) * bind / tan(bind * new_power);
  else
    nuv = m + normalize(d) * atan(r * -new_power * 10.0) * bind / atan(-new_power * bind * 10.0);

  gl_FragColor = texture2D(screenTexture, vec2(nuv.x, nuv.y * aspect));
}
`,

  glitch: `
precision highp float;

varying lowp vec2 uv;
uniform sampler2D screenTexture;
uniform float time;

uniform float power; // %0.03%
uniform float rate; // %0.6% 0..1
uniform float speed; // %5.0%
uniform float blockCount; // %30.5%
uniform float colorRate; // %0.01% 0..1

float my_trunc(float x) {
  return x < 0.0 ? -floor(-x) : floor(x);
}

float random(float seed) {
  return fract(543.2543 * sin(dot(vec2(seed, seed), vec2(3525.46, -54.3415))));
}

void main() {
  float enable_shift = float(random(my_trunc(time * speed)) < rate);

  vec2 fixed_uv = uv;
  fixed_uv.x += (random((my_trunc(uv.y * blockCount) / blockCount) + time) - 0.5) * power * enable_shift;

  vec4 pixel_color = texture2D(screenTexture, fixed_uv);
  pixel_color.r = mix(
    pixel_color.r,
    texture2D(screenTexture, fixed_uv + vec2(colorRate, 0.0)).r,
    enable_shift
  );
  pixel_color.b = mix(
    pixel_color.b,
    texture2D(screenTexture, fixed_uv + vec2(-colorRate, 0.0)).b,
    enable_shift
  );
  gl_FragColor = pixel_color;
}
`,

  grayscale: `
precision mediump float;

varying lowp vec2 uv;
uniform sampler2D screenTexture;

uniform float factor; // %1.0% 0..1

void main() {
  vec3 color = texture2D(screenTexture, uv).xyz;
  vec3 lum = vec3(0.299, 0.587, 0.114);
  vec3 gray = vec3(dot(lum, color));
  gl_FragColor = vec4(mix(color, gray, factor), 1.0);
}
`,

  noise: `
precision highp float;

varying lowp vec2 uv;
uniform sampler2D screenTexture;

uniform float seed; // %81.0%
uniform float power; // %0.03% 0..1

vec2 random(vec2 pos) {
  return fract(sin(vec2(dot(pos, vec2(12.9898, 78.233)), dot(pos, vec2(-148.998, -65.233)))) * 43758.5453);
}

void main() {
  vec2 new_uv = uv + (random(uv + vec2(seed, 0.0)) - vec2(0.5, 0.5)) * power;
  gl_FragColor = texture2D(screenTexture, new_uv);
}
`,

  pixel: `
precision mediump float;

varying lowp vec2 uv;
uniform vec2 screenSize;
uniform sampler2D screenTexture;

uniform float size; // %10.0%

void main() {
  vec2 factor = screenSize / size;
  float x = floor(uv.x * factor.x + 0.5) / factor.x;
  float y = floor(uv.y * factor.y + 0.5) / factor.y;
  gl_FragColor = texture2D(screenTexture, vec2(x, y));
}
`,

  shockwave: `
precision mediump float;

varying lowp vec2 uv;
uniform vec2 screenSize;
uniform sampler2D screenTexture;

uniform float progress; // %0.2% 0..1
uniform float centerX; // %0.5% 0..1
uniform float centerY; // %0.5% 0..1
uniform float width; // %0.1%
uniform float distortion; // %0.8%
uniform float expand; // %10.0%

void main() {
  float aspect = screenSize.y / screenSize.x;

  vec2 center = vec2(centerX, centerY);
  center.y = (center.y - 0.5) * aspect + 0.5;

  vec2 tex_coord = uv;
  tex_coord.y = (tex_coord.y - 0.5) * aspect + 0.5;
  float dist = distance(tex_coord, center);

  if (progress - width <= dist && dist <= progress + width) {
    float diff = dist - progress;
    float scale_diff = 1.0 - pow(abs(diff * expand), distortion);
    float dt = diff * scale_diff;

    vec2 dir = normalize(tex_coord - center);

    tex_coord += ((dir * dt) / (progress * dist * 40.0));
    gl_FragColor = texture2D(screenTexture, vec2(tex_coord.x, (tex_coord.y - 0.5) / aspect + 0.5));

    gl_FragColor += (gl_FragColor * scale_diff) / (progress * dist * 40.0);
  } else {
    gl_FragColor = texture2D(screenTexture, vec2(tex_coord.x, (tex_coord.y - 0.5) / aspect + 0.5));
  }
}
`
};

// Aliases (snake_case -> camelCase etc.)
PRESET_SHADERS.radial_blur = PRESET_SHADERS.radialBlur;
PRESET_SHADERS.circle_blur = PRESET_SHADERS.circleBlur;
