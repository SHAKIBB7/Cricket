'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from 'react';
import { EASINGS, REVEAL_MAX_STAGGER_INDEX, REVEAL_STAGGER_SECONDS } from '@/lib/animations';

/**
 * Media entrance in the ONE motion system (image-entrance
 * programme, 2026-11-11 — the owner's "images pop in late" fix).
 *
 * RevealImg (content images): while the image loads, its exact
 * box holds a shimmer skeleton; on load the image enters with
 * the Reveal curve (scale 0.97 → 1 + fade, 0.28 s iOS ease),
 * staggered by `index` when several media mount together. A
 * cached image (complete on mount) renders plainly — no flash.
 *
 * Watermark mode (decorative absolute images at class-driven
 * opacity): no skeleton, no scale — the image fades in by
 * handing its inline opacity back to the CSS class on load, so
 * hover opacity transitions keep working afterwards.
 *
 * MediaReveal (hero media like the Stadium Lottie): a static
 * poster fills the box until the real media reports `ready`,
 * then the media scale/fades in while the poster crossfades
 * out. Reduced motion renders everything plainly.
 */

interface RevealImgProps
  extends Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    | 'onDrag'
    | 'onDragStart'
    | 'onDragEnd'
    | 'onDragEnter'
    | 'onDragLeave'
    | 'onDragOver'
    | 'onDragExit'
    | 'onDrop'
    | 'onAnimationStart'
    | 'onAnimationEnd'
    | 'onAnimationIteration'
    | 'onTransitionEnd'
  > {
  index?: number;
  watermark?: boolean;
  wrapperClassName?: string;
}

export function RevealImg({
  index,
  watermark = false,
  wrapperClassName,
  onLoad,
  style,
  decoding = 'async',
  ...imgProps
}: RevealImgProps) {
  const reduce = useReducedMotion();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [skeletonGone, setSkeletonGone] = useState(false);

  // Cached / already-complete images never show a skeleton.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  if (reduce) {
    // eslint-disable-next-line jsx-a11y/alt-text -- alt passes through imgProps
    return <img {...imgProps} style={style} onLoad={onLoad} decoding={decoding} />;
  }

  if (watermark) {
    return (
      // eslint-disable-next-line jsx-a11y/alt-text -- alt passes through imgProps
      <img
        {...imgProps}
        ref={imgRef}
        decoding={decoding}
        style={{ ...style, opacity: loaded ? undefined : 0, transition: 'opacity 0.45s ease' }}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
      />
    );
  }

  const delay =
    typeof index === 'number'
      ? Math.min(Math.max(index, 0), REVEAL_MAX_STAGGER_INDEX) * REVEAL_STAGGER_SECONDS
      : 0;

  return (
    <span className={`relative block ${wrapperClassName ?? ''}`}>
      {!skeletonGone && (
        <motion.span
          aria-hidden="true"
          className="animate-shimmer absolute inset-0 pointer-events-none"
          initial={{ opacity: loaded ? 0 : 1 }}
          animate={{ opacity: loaded ? 0 : 1 }}
          transition={{ duration: 0.2 }}
          onAnimationComplete={() => {
            if (loaded) setSkeletonGone(true);
          }}
        />
      )}
      <motion.img
        {...imgProps}
        ref={imgRef}
        style={style}
        decoding={decoding}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.28, ease: EASINGS.ios, delay }}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
      />
    </span>
  );
}

interface MediaRevealProps {
  ready: boolean;
  poster: string;
  className?: string;
  children: ReactNode;
}

export function MediaReveal({ ready, poster, className, children }: MediaRevealProps) {
  const reduce = useReducedMotion();
  const [posterGone, setPosterGone] = useState(false);

  if (reduce) {
    return <div className={`relative ${className ?? ''}`}>{children}</div>;
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={ready ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.28, ease: EASINGS.ios }}
      >
        {children}
      </motion.div>
      {!posterGone && (
        <motion.img
          src={poster}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: ready ? 0 : 1 }}
          transition={{ duration: 0.3, ease: EASINGS.ios }}
          onAnimationComplete={() => {
            if (ready) setPosterGone(true);
          }}
        />
      )}
    </div>
  );
}
