"use client";

import { createContext, useContext } from "react";

/**
 * Seconds since the region was shown (its PreShow): what stop motion frames step on. The animated region wrapper
 * provides it and ticks it every frame while something needs it; outside one it stays 0 (first frame).
 */
export const RegionClockContext = createContext<number>(0);

export const useRegionClock = () => useContext(RegionClockContext);
