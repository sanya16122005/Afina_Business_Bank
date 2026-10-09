import { useEffect, useRef } from 'react';

/*
 * 3D «А» Pyramid — Afina logo as a volumetric shape.
 * Front face = isoceles triangle (matching the logo proportions).
 * Right side + bottom strips produce isometric 3D depth.
 * Crossbar replicates the brand «А» mark on every shape.
 */
function Pyramid3D({ id, baseColor = '#F4A683', midColor = '#E8926E', darkColor = '#C4724E', highlightColor = '#FFD4BC' }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Front face: top-lit gradient */}
        <linearGradient id={`gf-${id}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={highlightColor} stopOpacity="0.95" />
          <stop offset="40%" stopColor={baseColor} stopOpacity="0.90" />
          <stop offset="100%" stopColor={midColor} stopOpacity="0.82" />
        </linearGradient>
        {/* Right side face: darker */}
        <linearGradient id={`gr-${id}`} x1="0%" y1="0%" x2="100%" y2="80%">
          <stop offset="0%" stopColor={midColor} stopOpacity="0.75" />
          <stop offset="100%" stopColor={darkColor} stopOpacity="0.92" />
        </linearGradient>
        {/* Bottom strip: darkest */}
        <linearGradient id={`gb-${id}`} x1="0%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={darkColor} stopOpacity="0.55" />
          <stop offset="100%" stopColor={darkColor} stopOpacity="0.75" />
        </linearGradient>
        {/* Specular highlight */}
        <radialGradient id={`hl-${id}`} cx="40%" cy="30%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.50" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* Drop shadow */}
        <filter id={`sh-${id}`} x="-15%" y="-10%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor={darkColor} floodOpacity="0.30" />
        </filter>
      </defs>

      <g filter={`url(#sh-${id})`}>
        {/* Bottom depth strip (parallelogram) */}
        <path d="M22 172 L178 172 L188 164 L32 164 Z" fill={`url(#gb-${id})`} />
        {/* Right side depth strip (parallelogram) */}
        <path d="M100 18 L178 172 L188 164 L110 10 Z" fill={`url(#gr-${id})`} />
        {/* Front face — the «А» isoceles triangle */}
        <path d="M100 18 L22 172 L178 172 Z" fill={`url(#gf-${id})`} />
      </g>

      {/* Specular highlight on front face */}
      <path d="M100 18 L22 172 L178 172 Z" fill={`url(#hl-${id})`} />

      {/* ── Afina «А» brand mark ── */}
      {/* Crossbar */}
      <line x1="48" y1="129" x2="152" y2="129"
        stroke="rgba(255,255,255,0.50)" strokeWidth="2" strokeLinecap="round" />

      {/* Edge highlights */}
      <line x1="100" y1="18" x2="22" y2="172" stroke="rgba(255,255,255,0.30)" strokeWidth="0.8" />
      <line x1="100" y1="18" x2="178" y2="172" stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" />
      <line x1="22" y1="172" x2="178" y2="172" stroke="rgba(255,255,255,0.10)" strokeWidth="0.5" />
    </svg>
  );
}

// Color schemes for pyramids
const pyramidColors = [
  { baseColor: '#F4A683', midColor: '#E8926E', darkColor: '#C4724E', highlightColor: '#FFD4BC' },   // warm peach
  { baseColor: '#F8C4A8', midColor: '#F4A683', darkColor: '#D4835E', highlightColor: '#FDE8DA' },   // light peach
  { baseColor: '#E8926E', midColor: '#D4795A', darkColor: '#B35E3E', highlightColor: '#F8C4A8' },   // deep orange
  { baseColor: '#FDDECF', midColor: '#F8C4A8', darkColor: '#E8A88A', highlightColor: '#FFF2EB' },   // pale blush
];

export default function GlassBackground() {
  const ref = useRef(null);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (ref.current) {
            const y = window.scrollY || document.documentElement.scrollTop;
            ref.current.style.transform = `translate3d(0, ${y * 0.12}px, 0)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="glass-bg" ref={ref} aria-hidden="true">
      {/* 3D volumetric pyramids — Afina «А» logo shapes */}
      {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
        <div key={`p${i}`} className={`glass-bg__pyramid glass-bg__pyramid--${i}`}>
          <Pyramid3D id={`pyr${i}`} {...pyramidColors[(i - 1) % pyramidColors.length]} />
        </div>
      ))}

      {/* Ambient glows */}
      <div className="glass-bg__glow glass-bg__glow--1" />
      <div className="glass-bg__glow glass-bg__glow--2" />
      <div className="glass-bg__glow glass-bg__glow--3" />

      {/* Dot grid */}
      <div className="glass-bg__grid" />
    </div>
  );
}
