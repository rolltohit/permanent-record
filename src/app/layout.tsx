import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "Rec Room", template: "%s · Rec Room" },
  description: "Music recommendations from your friends.",
  appleWebApp: { capable: true, title: "Rec Room", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#15110d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
