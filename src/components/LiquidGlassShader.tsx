import React, { useEffect, useRef, useState } from 'react';

interface LiquidGlassShaderProps {
  className?: string;
  intensity?: number;
  interactive?: boolean;
}

export const LiquidGlassShader: React.FC<LiquidGlassShaderProps> = ({
  className = '',
  intensity = 0.85,
  interactive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasWebGL, setHasWebGL] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const gl =
      canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' }) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      setHasWebGL(false);
      return;
    }

    // Vertex Shader: Fullscreen quad
    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_position + 1.0) * 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // Fragment Shader: Organic Liquid Fluid Caustics & Molten Amber Shimmer
    const fsSource = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform float u_intensity;
      varying vec2 v_uv;

      // Fractional Brownian Motion & Domain Warping for Liquid Viscosity
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
        for (int i = 0; i < 4; ++i) {
          v += a * noise(p);
          p = rot * p * 2.0 + shift;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        st.y = 1.0 - st.y;
        vec2 p = st * 3.0;

        float t = u_time * 0.18;

        // Fluid liquid domain warping
        vec2 q = vec2(fbm(p + vec2(0.0, t * 0.4)), fbm(p + vec2(5.2, 1.3 - t * 0.3)));
        vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7 - t * 0.5, 9.2)),
                      fbm(p + 4.0 * q + vec2(8.3, 2.8 + t * 0.35)));

        // Interactive mouse wave refraction
        vec2 mouseDelta = (st - u_mouse);
        float mouseDist = length(mouseDelta);
        float mouseRipple = sin(mouseDist * 18.0 - u_time * 2.5) * exp(-mouseDist * 4.0) * 0.25;
        r += mouseRipple;

        float f = fbm(p + 3.0 * r);

        // Deep obsidian base color
        vec3 darkObsidian = vec3(0.043, 0.059, 0.090); // #0B0F17
        vec3 midCharcoal  = vec3(0.075, 0.098, 0.155); // #131927

        // Liquid amber & warm honey highlights
        vec3 warmAmber    = vec3(1.000, 0.410, 0.140); // #FF6824
        vec3 moltenGold   = vec3(0.960, 0.650, 0.220); // #F5A638

        // Liquid specular refraction (subtle cyan/emerald caustics)
        vec3 iridescentCaustic = vec3(0.060, 0.720, 0.550); // #10B98C

        // Mix liquid layers
        vec3 color = mix(darkObsidian, midCharcoal, clamp(f * f * 2.5, 0.0, 1.0));
        color = mix(color, warmAmber, clamp(length(q) * f * 0.45 * u_intensity, 0.0, 0.8));
        color = mix(color, moltenGold, clamp(pow(r.x, 2.2) * 0.38 * u_intensity, 0.0, 0.7));
        color = mix(color, iridescentCaustic, clamp(pow(r.y, 3.5) * 0.18 * u_intensity, 0.0, 0.4));

        // Specular liquid glass glint
        float glint = pow(max(0.0, fbm(p * 2.0 + t)), 4.0) * 0.25 * u_intensity;
        color += vec3(glint * 0.9, glint * 0.7, glint * 0.5);

        // Vignette at corners for rich cinematic dark mode focus
        float vignette = smoothstep(1.4, 0.3, length((st - 0.5) * vec2(1.1, 1.0)));
        color *= (0.65 + 0.35 * vignette);

        gl_FragColor = vec4(color, 0.95);
      }
    `;

    const createShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Shader compile failed:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) {
      setHasWebGL(false);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setHasWebGL(false);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Program link failed:', gl.getProgramInfoLog(program));
      setHasWebGL(false);
      return;
    }

    gl.useProgram(program);

    // Quad geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const mouseLocation = gl.getUniformLocation(program, 'u_mouse');
    const intensityLocation = gl.getUniformLocation(program, 'u_intensity');

    let animationFrameId: number;
    let startTime = performance.now();
    let mousePos = { x: 0.5, y: 0.5 };
    let targetMousePos = { x: 0.5, y: 0.5 };

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      targetMousePos.x = e.clientX / window.innerWidth;
      targetMousePos.y = 1.0 - e.clientY / window.innerHeight;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!interactive || e.touches.length === 0) return;
      const touch = e.touches[0];
      targetMousePos.x = touch.clientX / window.innerWidth;
      targetMousePos.y = 1.0 - touch.clientY / window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // Cap for 60fps power efficiency
      const displayWidth = Math.floor(window.innerWidth * dpr * 0.65);
      const displayHeight = Math.floor(window.innerHeight * dpr * 0.65);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, displayWidth, displayHeight);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    let isDocumentVisible = true;
    const handleVisibilityChange = () => {
      isDocumentVisible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const render = (now: number) => {
      if (!isDocumentVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const elapsed = (now - startTime) * 0.001;

      // Smooth mouse interpolation
      mousePos.x += (targetMousePos.x - mousePos.x) * 0.05;
      mousePos.y += (targetMousePos.y - mousePos.y) * 0.05;

      gl.uniform1f(timeLocation, elapsed);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform2f(mouseLocation, mousePos.x, mousePos.y);
      gl.uniform1f(intensityLocation, intensity);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      if (program) gl.deleteProgram(program);
    };
  }, [intensity, interactive]);

  if (!hasWebGL) {
    // Beautiful CSS Fluid Liquid Mesh Fallback
    return (
      <div
        className={`fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-[#0B0F17] ${className}`}
        aria-hidden="true"
      >
        <div className="absolute -top-[30%] -left-[20%] w-[80vw] h-[80vw] rounded-full bg-gradient-to-tr from-[#FF6422]/20 via-[#FF8A00]/10 to-transparent blur-[120px] animate-pulse duration-[8000ms]" />
        <div className="absolute top-[40%] -right-[20%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-bl from-[#10B981]/15 via-[#38BDF8]/10 to-transparent blur-[140px] animate-pulse duration-[10000ms]" />
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 pointer-events-none -z-10 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover opacity-85 transition-opacity duration-1000"
      />
      {/* Liquid Glass Frosted Sheen & Caustics Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#0B0F17]/70 pointer-events-none backdrop-blur-[2px]" />
    </div>
  );
};
