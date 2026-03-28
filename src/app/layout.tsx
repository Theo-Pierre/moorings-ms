import type { Metadata } from "next";
import { Manrope, Outfit } from "next/font/google";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "moorings.ms | Planning Intelligence",
  description:
    "Moorings Power planning intelligence engine for demand, staffing capacity, and vessel-priority recommendations powered by MP Starts & Ends and Daily TA Tortola.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US" className={`${manrope.variable} ${outfit.variable}`}>
      <body>{children}</body>
    </html>
  );
}
