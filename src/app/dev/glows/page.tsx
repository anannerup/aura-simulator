import type { Metadata } from "next";
import { GlowDemo } from "./GlowDemo";

export const metadata: Metadata = { title: "Glows · Aura Simulator dev" };

export default function GlowsPage() {
  return <GlowDemo />;
}
