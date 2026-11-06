import type { Metadata, Viewport } from "next";
import { Cinzel, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-face", subsets: ["latin"] });
/** Display face for the logo only. */
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "Aura Simulator",
  description: "Build and preview Musca Auras auras, then copy their import string.",
};

export const viewport: Viewport = { themeColor: "#0c0f15" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${cinzel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
