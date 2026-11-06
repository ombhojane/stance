import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { Nav } from "@/components/Nav";
import { Toasts } from "@/components/Toasts";
import { themeInitScript } from "@/components/Theme";
import { MotionProvider } from "@/components/MotionProvider";
import { ServiceWorker } from "@/components/ServiceWorker";
import { PrefetchRoutes } from "@/components/PrefetchRoutes";
import { Web3Provider } from "@/components/Web3Provider";
import { ModeProvider } from "@/lib/mode";

// Self-hosted at build time: no render-blocking request to Google, no layout shift.
const sans = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter-tight", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Stance",
  description: "Trade what you think happens next. Capped risk, real odds, on ETH.",
  applicationName: "Stance",
  appleWebApp: { capable: true, title: "Stance", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f3f1ea" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh" suppressHydrationWarning>
        {/* sets data-theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <MotionProvider>
          <ModeProvider>
          <Web3Provider>
          <StoreProvider>
            <div className="relative z-10">
              <Nav />
              <main className="mx-auto w-full max-w-[1180px] px-4 pb-32 pt-4 sm:px-6">{children}</main>
            </div>
            <Toasts />
          </StoreProvider>
          </Web3Provider>
          </ModeProvider>
        </MotionProvider>
        <ServiceWorker />
        <PrefetchRoutes />
      </body>
    </html>
  );
}
