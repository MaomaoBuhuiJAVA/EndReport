"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

interface SpecularButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  tone?: "teal" | "gold" | "ink";
}

const vertexShader = `
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    float ratio = uResolution.x / max(uResolution.y, 1.0);
    vec2 point = vec2((uv.x - 0.5) * ratio, uv.y - 0.5);
    float sweep = sin((point.x + point.y * 0.35) * 7.0 - uTime * 1.35) * 0.5 + 0.5;
    float edge = smoothstep(0.72, 0.08, length(vec2(point.x * 0.55, point.y)));
    float streak = smoothstep(0.84, 1.0, sweep) * edge;
    float glint = smoothstep(0.97, 1.0, sin((point.x - point.y) * 15.0 + uTime * 0.8));
    vec3 color = vec3(0.95, 1.0, 1.0) * (streak * 0.22 + glint * 0.08);
    gl_FragColor = vec4(color, edge * (0.16 + streak * 0.36));
  }
`;

export function SpecularButton({
  children,
  icon,
  tone = "teal",
  className = "",
  ...props
}: SpecularButtonProps) {
  const hostRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("ogl").then(({ Mesh, Program, Renderer, Triangle }) => {
      if (cancelled) return;

      const renderer = new Renderer({
        canvas,
        alpha: true,
        dpr: Math.min(window.devicePixelRatio, 2),
      });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      const geometry = new Triangle(gl);
      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: [1, 1] },
        },
      });
      const mesh = new Mesh(gl, { geometry, program });
      const startedAt = performance.now();
      let frame = 0;

      const resize = () => {
        const bounds = host.getBoundingClientRect();
        renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height));
        program.uniforms.uResolution.value = [bounds.width, bounds.height];
      };
      const render = (now: number) => {
        program.uniforms.uTime.value = (now - startedAt) / 1000;
        renderer.render({ scene: mesh });
        frame = window.requestAnimationFrame(render);
      };

      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      frame = window.requestAnimationFrame(render);

      cleanup = () => {
        observer.disconnect();
        window.cancelAnimationFrame(frame);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <button
      ref={hostRef}
      className={`specular-button specular-button--${tone} ${className}`}
      {...props}
    >
      <canvas ref={canvasRef} className="specular-button__canvas" aria-hidden="true" />
      <span className="specular-button__content">
        {icon ? <span className="specular-button__icon">{icon}</span> : null}
        <span>{children}</span>
      </span>
    </button>
  );
}
