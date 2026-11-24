(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const vertex = 'attribute vec2 point; void main(){gl_Position=vec4(point,0.,1.);}';
  const fragment = `
precision highp float;
uniform vec2 resolution;
uniform float phase;

mat2 rotation(float a) {
    return mat2(cos(a), sin(a), -sin(a), cos(a));
}
float oval(vec3 p, vec3 radii) {
    return (length(p / radii) - 1.0) * min(radii.x, min(radii.y, radii.z));
}
float merge(float a, float b, float radius) {
    float blend = max(radius - abs(a - b), 0.0) / radius;
    return min(a, b) - blend * blend * radius * 0.25;
}
float sculpture(vec3 p) {
    p.y -= 1.13 + 0.045 * sin(phase);
    p.xz = rotation(0.2 + 0.34 * sin(phase)) * p.xz;
    p.xy = rotation(-0.12 + 0.09 * sin(phase + 0.5)) * p.xy;
    float crown = oval(p - vec3(-0.13, 0.12, 0.0), vec3(0.70, 0.55, 0.48));
    vec3 cap = p - vec3(0.22, 0.43, -0.03);
    cap.xy = rotation(-0.29) * cap.xy;
    crown = merge(crown, oval(cap, vec3(0.46, 0.22, 0.32)), 0.19);
    float shoulder = oval(p - vec3(0.42, -0.03, -0.12), vec3(0.34, 0.44, 0.34));
    crown = merge(crown, shoulder, 0.15);
    vec3 droplet = p - vec3(0.18, -0.64, 0.21);
    droplet.xy = rotation(0.21) * droplet.xy;
    float lower = oval(droplet, vec3(0.32, 0.47, 0.31));
    float body = merge(crown, lower, 0.17);
    float crease = oval(p - vec3(0.37, -0.22, 0.51), vec3(0.48, 0.14, 0.24));
    body = -merge(-body, crease, 0.045);
    return body + 0.026 * sin(p.x * 8.0 + p.y * 7.0 + phase) * cos(p.z * 6.0 + p.y * 3.0);
}
vec3 normalAt(vec3 p) {
    vec2 e = vec2(0.0015, 0.0);
    return normalize(vec3(sculpture(p+e.xyy)-sculpture(p-e.xyy),
                          sculpture(p+e.yxy)-sculpture(p-e.yxy),
                          sculpture(p+e.yyx)-sculpture(p-e.yyx)));
}
float trace(vec3 origin, vec3 ray, float limit) {
    float distance = 0.0;
    for (int step = 0; step < 100; step++) {
        float gap = sculpture(origin + ray * distance);
        if (gap < 0.00075) return distance;
        distance += gap * 0.80;
        if (distance > limit) break;
    }
    return -1.0;
}
float softbox(vec3 reflected, vec3 direction, vec2 extent) {
    vec3 right = normalize(cross(vec3(0., 1., 0.), direction));
    vec3 up = cross(direction, right);
    vec2 edge = abs(vec2(dot(reflected, right), dot(reflected, up)));
    vec2 position = edge / extent;
    vec2 panel = 1.0 - smoothstep(vec2(0.79), vec2(1.04), position);
    float falloff = 1.0 - 0.31 * dot(position, position) * 0.5;
    return step(0.0,dot(reflected,direction)) * panel.x * panel.y * falloff;
}
float studio(vec3 r) {
    float light = mix(0.009, 0.075, smoothstep(-0.2, 0.45, r.y));
    light += 0.10 * pow(max(dot(r, normalize(vec3(-0.84,0.27,0.66))), 0.0), 7.0);
    light += 0.15 * softbox(r,normalize(vec3(0.92,-0.31,0.78)),vec2(0.08,0.37));
    light += 1.15 * softbox(r,normalize(vec3(-0.55,0.78,0.7)),vec2(0.66,0.46));
    light += 0.98 * softbox(r,normalize(vec3(0.75,0.49,0.58)),vec2(0.38,0.21));
    light += 0.85 * softbox(r,normalize(vec3(0.28,0.70,-0.82)),vec2(0.55,0.16));
    light += 0.48 * softbox(r,normalize(vec3(-0.90,0.14,-0.44)),vec2(0.24,0.53));
    return light;
}
float metal(vec3 point, vec3 ray) {
    vec3 n = normalAt(point);
    vec3 reflected = reflect(ray,n);
    float rim = pow(1.0-max(0.0,dot(n,-ray)),4.0);
    return studio(reflected) + rim * (0.034 + 0.090 * max(n.y,0.0));
}
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec3 origin = vec3(0.0, 1.40, 4.3);
    vec3 ray = normalize(vec3(uv.x, uv.y - 0.23, -1.30));
    float glow = exp(-3.1 * uv.x * uv.x - 24.0 * (uv.y-0.11)*(uv.y-0.11));
    float tone = 0.013 + 0.105 * glow;
    float floorDist = -origin.y / min(ray.y,-0.001);
    float hit = trace(origin,ray,min(floorDist,8.0));
    if (hit >= 0.0 && hit < floorDist) {
        tone = metal(origin+ray*hit,ray);
    } else if (ray.y < -0.01 && floorDist < 12.0) {
        vec3 floorPoint = origin + ray * floorDist;
        vec2 ripple = floorPoint.xz - vec2(0.09,0.3);
        float radius = max(0.04,length(ripple));
        float slope = 0.023 * cos(radius*15.0-phase*2.0) * exp(-radius*0.95);
        vec2 drift = vec2(0.0045 * cos(13.0 * floorPoint.x + 6.0 * floorPoint.z + phase),
                          0.0035 * sin(9.0 * floorPoint.z - phase));
        vec3 n = normalize(vec3(slope*ripple.x/radius + drift.x,1.0,slope*ripple.y/radius + drift.y));
        vec3 reflected = reflect(ray,n);
        float mirror = trace(floorPoint+vec3(0.0,0.006,0.0),reflected,6.0);
        float fresnel = pow(1.0 - abs(dot(n,ray)), 4.0);
        float reflection = 0.43 + 0.42 * fresnel;
        float glint = 0.14 * pow(max(dot(reflected,normalize(vec3(-0.45,0.43,0.78))),0.0),36.0);
        tone = mix(tone,0.017+(0.085+0.08*fresnel)*studio(reflected)+glint,1.0-smoothstep(5.0,12.0,floorDist));
        if (mirror >= 0.0) tone = mix(tone, metal(floorPoint+reflected*mirror,reflected), reflection);
    }
    float graded = pow(max(0.0,1.0-exp(-1.9*tone)),0.88);
    // Subtle spatial dither keeps near-black gradients from showing visible bands.
    float dither = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056,0.00583715)))) - 0.5) / 255.0;
    gl_FragColor = vec4(vec3(clamp(graded + dither,0.0,1.0)),1.0);
}
`;

  function mount() {
    const host = document.querySelector('.landing-mode .hero-left');
    if (!host || host.querySelector('.liquid-scene')) return;
    const scene = document.createElement('div');
    scene.className = 'liquid-scene';
    scene.setAttribute('aria-hidden', 'true');
    const video = document.createElement('video');
    video.poster = '/static/chrome-poster-hd.webp';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    scene.append(video);
    host.prepend(scene);

    function fallback() {
      delete scene.dataset.live;
      if (!motion.matches && scene.isConnected) {
        if (!video.getAttribute('src')) {
          video.addEventListener('error', () => {
            if (!scene.isConnected || motion.matches) return;
            video.src = '/static/chrome-loop-60fps.mp4';
            video.play().catch(() => {});
          }, {once: true});
          video.src = '/static/chrome-loop-120fps.mp4';
        }
        video.play().catch(() => {});
      }
    }

    const canvas = document.createElement('canvas');
    if (motion.matches) return;
    let gl;
    try { gl = canvas.getContext('webgl', {alpha: false, antialias: false, powerPreference: 'high-performance'}); }
    catch { fallback(); return; }
    if (!gl) { fallback(); return; }

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      gl.deleteShader(shader);
      return null;
    }

    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      fallback();
      return;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      fallback();
      return;
    }
    scene.append(canvas);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const point = gl.getAttribLocation(program, 'point');
    gl.enableVertexAttribArray(point);
    gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, 'resolution');
    const phase = gl.getUniformLocation(program, 'phase');
    const start = performance.now();
    let frame;
    let live = false;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(canvas);
    canvas.addEventListener('webglcontextlost', () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      fallback();
    }, {once: true});

    function render(now) {
      if (!canvas.isConnected) {
        observer.disconnect();
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        return;
      }
      if (visible && !document.hidden) {
        const cssWidth = Math.max(1, canvas.clientWidth);
        const cssHeight = Math.max(1, canvas.clientHeight);
        const scale = Math.min(window.devicePixelRatio || 1, 1.5, 900 / cssHeight, 1100 / cssWidth);
        const width = Math.max(1, Math.round(cssWidth * scale));
        const height = Math.max(1, Math.round(cssHeight * scale));
        if (!live || canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
          gl.uniform2f(resolution, width, height);
        }
        gl.uniform1f(phase, motion.matches ? 0 : ((now - start) % 6000) * Math.PI / 3000);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!live) {
          live = true;
          scene.dataset.live = '';
        }
      }
      if (!motion.matches || !live) frame = requestAnimationFrame(render);
      else observer.disconnect();
    }
    frame = requestAnimationFrame(render);
  }

  const content = document.getElementById('content');
  if (!content) return;
  new MutationObserver(mount).observe(content, {childList: true});
  mount();
})();
