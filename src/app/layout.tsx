import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CoinFarm — Idle Crypto Miner",
  description:
    "Mine $FARM, ride the market, stake for yield, and prestige to grow forever. A crypto idle game.",
  openGraph: {
    title: "CoinFarm — Idle Crypto Miner",
    description: "Mine $FARM, ride the market, stake for yield, prestige forever.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "CoinFarm — Idle Crypto Miner",
    description: "Mine $FARM, ride the market, stake for yield, prestige forever.",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", background: "#0a0a0c" }}>
        {children}
      </body>
    </html>
  );
}
