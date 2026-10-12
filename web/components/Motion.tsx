'use client';
import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fades children marked `data-reveal` up into place as they scroll in. Content is visible without JS. */
export function Reveal({ children, className, as: Tag = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'section' }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      const items = gsap.utils.toArray<HTMLElement>('[data-reveal]', ref.current);
      items.forEach((el) => {
        gsap.from(el, {
          y: 28,
          autoAlpha: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      });
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

/** Headline that rises line by line from behind a mask. */
export function SplitHeadline({ children, className, as: Tag = 'h1' }: { children: React.ReactNode; className?: string; as?: 'h1' | 'h2' | 'p' }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      if (reduced() || !ref.current) return;
      let split: SplitText | null = null;
      document.fonts.ready.then(() => {
        if (!ref.current) return;
        split = SplitText.create(ref.current, { type: 'lines', mask: 'lines', autoSplit: true, onSplit: (self) =>
          gsap.from(self.lines, { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.08 }),
        });
      });
      return () => split?.revert();
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

/** A number that counts up once when it scrolls into view. Server-rendered with its final value. */
export function CountUp({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  useGSAP(
    () => {
      if (reduced() || !ref.current) return;
      const o = { v: 0 };
      gsap.to(o, {
        v: value,
        duration: 1.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: ref.current, start: 'top 92%', once: true },
        onUpdate: () => {
          if (ref.current) ref.current.textContent = fmt(o.v);
        },
      });
    },
    { scope: ref, dependencies: [value] },
  );
  return (
    <span ref={ref} className={className}>
      {fmt(value)}
    </span>
  );
}
