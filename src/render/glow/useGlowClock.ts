"use client";

import { useEffect, useRef } from "react";

/**
 * Drives a glow animation. Calls `onFrame(t, elapsed)` every animation frame with seconds since
 * `restartKey` last changed, writing styles imperatively (no React render per frame). With
 * `fixedTime` set, renders that single moment after every React render instead (still
 * renders, tests, scrubbing).
 */
export function useGlowClock(
  onFrame: (t: number, elapsed: number) => void,
  restartKey: unknown,
  fixedTime: number | undefined,
) {
  const callback = useRef(onFrame);
  useEffect(() => {
    callback.current = onFrame;
    if (fixedTime !== undefined) onFrame(fixedTime, 0);
  });

  const live = fixedTime === undefined;
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    let start: number | null = null;
    let last = 0;
    const tick = (now: number) => {
      if (start === null) {
        start = now;
        last = now;
      }
      callback.current((now - start) / 1000, (now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [restartKey, live]);
}
