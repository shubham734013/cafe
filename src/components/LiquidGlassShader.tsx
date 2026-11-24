import React, { useEffect, useRef, useState } from 'react';
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation';
import { WavyBackground } from '@/components/ui/wavy-background';

export type ShaderType = 'aceternity-gradient' | 'aceternity-wavy' | 'webgl-liquid';

interface LiquidGlassShaderProps {
  className?: string;
  intensity?: number;
  interactive?: boolean;
  type?: ShaderType;
}

export const LiquidGlassShader: React.FC<LiquidGlassShaderProps> = ({
  className = '',
  intensity = 0.85,
  interactive = true,
  type = 'aceternity-gradient',
}) => {
  // If Aceternity UI Liquid Gradient is chosen (Default)
  if (type === 'aceternity-gradient') {
    return (
      <div
        className={`fixed inset-0 pointer-events-none -z-10 overflow-hidden ${className}`}
        aria-hidden="true"
      >
        <BackgroundGradientAnimation
          gradientBackgroundStart="rgb(11, 15, 23)"
          gradientBackgroundEnd="rgb(15, 23, 42)"
          firstColor="255, 100, 34"    // Seth Sawariya signature amber
          secondColor="245, 166, 56"   // Honey liquid gold
          thirdColor="16, 185, 129"    // Emerald caustic
          fourthColor="234, 88, 12"    // Molten deep orange
          fifthColor="59, 130, 246"    // Deep iridescent cyan
          pointerColor="255, 104, 36"  // Interactive molten mouse orb
          interactive={interactive}
          containerClassName="opacity-80"
        />
        {/* Specular sheen overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#0B0F17]/70 pointer-events-none backdrop-blur-[1px]" />
      </div>
    );
  }

  // If Aceternity UI Wavy Background is chosen
  if (type === 'aceternity-wavy') {
    return (
      <div
        className={`fixed inset-0 pointer-events-none -z-10 overflow-hidden ${className}`}
        aria-hidden="true"
      >
        <WavyBackground
          backgroundFill="#0b0f17"
          colors={['#FF6824', '#F5A638', '#10B98C', '#3B82F6', '#EA580C']}
          waveWidth={45}
          blur={12}
          speed="fast"
          waveOpacity={0.4}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#0B0F17]/70 pointer-events-none" />
      </div>
    );
  }

  // WebGL Native Fluid Shader
  return <NativeWebGLShader className={className} intensity={intensity} interactive={interactive} />;
};

/**
 * Pure WebGL Native Liquid Viscosity Shader
 */
const NativeWebGLShader: React.FC<{
  className?: string;
  intensity?: number;
  interactive?: boolean;
}> = ({ className = '', intensity = 0.85, interactive = true }) => {
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

    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_position + 1.0) * 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform float u_intensity;
      varying vec2 v_uv;

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

        vec2 mouseOffset = (u_mouse - vec2(0.5)) * 0.8;
        vec2 q = vec2(fbm(p + vec2(t * 0.4, t * 0.3) + mouseOffset),
                      fbm(p + vec2(1.0)));

        vec2 r = vec2(fbm(p + 2.5 * q + vec2(1.7, 9.2) + 0.15 * t),
                      fbm(p + 2.5 * q + vec2(8.3, 2.8) + 0.126 * t));

        float f = fbm(p + 3.0 * r);

        vec3 colorA = vec3(0.043, 0.059, 0.090); // #0B0F17
        vec3 colorB = vec3(0.078, 0.118, 0.188); // Deep Slate Navy
        vec3 colorC = vec3(1.0, 0.408, 0.141);   // Molten Amber #FF6824
        vec3 colorD = vec3(0.961, 0.651, 0.220); // Warm Honey #F5A638
        vec3 colorE = vec3(0.063, 0.725, 0.549); // Iridescent Turquoise #10B98C

        vec3 col = mix(colorA, colorB, clamp(f * f * 2.5, 0.0, 1.0));
        col = mix(col, colorC, clamp(length(q) * 0.65, 0.0, 1.0));
        col = mix(col, colorD, clamp(length(r.x) * 0.45, 0.0, 1.0));
        col += colorE * (f * f * f + 0.3 * f) * 0.22;

        float distFromMouse = length(st - u_mouse);
        float mouseWave = sin(distFromMouse * 25.0 - u_time * 4.0) * exp(-distFromMouse * 4.0);
        col += vec3(1.0, 0.5, 0.2) * max(0.0, mouseWave) * 0.25;

        col *= u_intensity;
        gl_FragColor = vec4(col, 0.88);
      }
    `;

    const createShader = (type: number, source: string) => {
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
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#0B0F17]/70 pointer-events-none backdrop-blur-[2px]" />
    </div>
  );
};
