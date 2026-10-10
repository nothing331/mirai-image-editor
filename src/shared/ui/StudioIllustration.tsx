"use client";

import { useId } from "react";

export function StudioIllustration({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 400 450" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="200" y1="0" x2="200" y2="450" gradientUnits="userSpaceOnUse"><stop stopColor="#c7d3c5" /><stop offset="1" stopColor="#e7e9da" /></linearGradient>
        <linearGradient id={`${id}-dune`} x1="85" y1="205" x2="295" y2="430" gradientUnits="userSpaceOnUse"><stop stopColor="#d6976c" /><stop offset="1" stopColor="#9d4d34" /></linearGradient>
        <linearGradient id={`${id}-foreground`} x1="270" y1="290" x2="90" y2="450" gradientUnits="userSpaceOnUse"><stop stopColor="#495d49" /><stop offset="1" stopColor="#293b32" /></linearGradient>
      </defs>
      <path fill={`url(#${id}-sky)`} d="M0 0h400v450H0z" />
      <circle cx="267" cy="125" r="46" fill="#f8f0d7" />
      <path d="M0 318c55-90 70-44 114-106 61-88 126 72 165 63 53-12 85-51 121-37v212H0V318Z" fill={`url(#${id}-dune)`} />
      <path d="M0 378c77-61 116 59 200 0 66-46 115-98 200-86v158H0v-72Z" fill={`url(#${id}-foreground)`} />
      <path d="M0 433c63-15 157-5 237-49 50-27 105-42 163-31v97H0v-17Z" fill="#24362e" />
      <path d="M192 73c25-29 91-23 120 1 29 25 30 90-1 113-29 22-95 22-120-7-22-26-25-78 1-107Z" stroke="#283d31" strokeWidth="1.5" strokeDasharray="5 5" />
      <path d="m322 179 5 24 6-8 10-1-21-15Z" fill="#faf9f6" stroke="#283d31" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
