"use client";

import { useEffect, useRef } from "react";

// Layered ridges of light drifting slowly in Klein blue, under a vignette and still grain. Hand-written WebGL1.
const FRAG = `
precision highp float;
uniform vec2 r;
uniform float t;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / r;
  float ar = r.x / r.y;
  vec2 p = vec2(uv.x * ar, uv.y);
  vec3 col = vec3(0.027, 0.031, 0.036);
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float depth = 1.0 + fk * 0.6;
    float base = 0.50 - fk * 0.085;
    float x = p.x / depth;
    float h = base + 0.20 * (fbm(vec2(x * 0.85 + t * 0.02 * (1.0 + fk * 0.4) + fk * 3.1, fk * 1.7 + t * 0.01)) - 0.5)
            + 0.05 * sin(x * 2.1 + fk * 1.3 + t * 0.05)
            + 0.05 * exp(-(uv.x - 0.55) * (uv.x - 0.55) / 0.03) * (1.0 - fk * 0.18);
    float d = uv.y - h;
    float src = exp(-(uv.x - 0.56) * (uv.x - 0.56) / (2.0 * 0.16 * 0.16));
    float lit = (0.35 + pow(fbm(vec2(p.x * 0.6 - t * 0.03, fk * 2.3)), 1.6) * 1.6) * (0.25 + src * 1.4);
    float m = clamp(fbm(vec2(p.x * 1.4 + t * 0.04, fk + 4.0)) * 1.3 - 0.15, 0.0, 1.0);
    vec3 light = mix(vec3(0.02, 0.16, 0.62), vec3(0.66, 0.76, 1.0), m);
    float body = 1.0 - smoothstep(-0.006, 0.006, d);
    col = mix(col, vec3(0.016, 0.02, 0.028) * (1.0 + fk * 0.25), body);
    float crest = exp(-abs(d) * (55.0 - fk * 7.0));
    float sheen = exp(min(d, 0.0) * (7.0 - fk * 0.8)) * body;
    col += light * (crest * 0.9 + sheen * 0.22) * lit * (1.0 - fk * 0.1);
  }
  vec2 q = (uv - vec2(0.5, 0.38)) * vec2(1.0, 1.6);
  col *= 1.0 - smoothstep(0.25, 1.15, length(q));
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) * 0.02;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

export function LedgerField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!gl) return; // the CSS background shows instead
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("LedgerField shader:", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("LedgerField link:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");

    const scale = 0.5; // half resolution: it is soft light, and it keeps laptops cool
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * scale));
      const h = Math.max(1, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    const t0 = performance.now();
    const draw = (now: number) => {
      resize();
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, reduce ? 12 : 12 + (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
