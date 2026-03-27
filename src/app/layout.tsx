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
  title: "moorings.ms | Turnaround Operations",
  description:
    "Moorings fleet turnaround scheduling and reporting dashboard powered by CSV/XLSX operational reports.",
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
