import type { Metadata, Viewport } from "next";
import { Geist_Mono, Marcellus, PT_Sans_Narrow } from "next/font/google";
import "./globals.css";

/** ElvUI's default UI font, which the user's in-game options window uses. */
const ptNarrow = PT_Sans_Narrow({ variable: "--font-pt-narrow", subsets: ["latin"], weight: ["400", "700"] });
/** Stand-in for Friz Quadrata until the game font has loaded (or if it can't). */
const marcellus = Marcellus({ variable: "--font-marcellus", subsets: ["latin"], weight: "400" });
const mono = Geist_Mono({ variable: "--font-mono-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aura Simulator",
  description: "Build and preview Musca Auras auras, then import them in the game.",
};

export const viewport: Viewport = { themeColor: "#0b0b0b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ptNarrow.variable} ${marcellus.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
