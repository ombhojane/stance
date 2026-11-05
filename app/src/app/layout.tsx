import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { Nav } from "@/components/Nav";
import { Toasts } from "@/components/Toasts";
import { themeInitScript } from "@/components/Theme";

export const metadata: Metadata = {
  title: "Stance",
  description: "Type a sentence. Get a capped-risk position, with the odds up front.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh" suppressHydrationWarning>
        {/* sets data-theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <StoreProvider>
          <div className="relative z-10">
            <Nav />
            <main className="mx-auto w-full max-w-[1180px] px-4 pb-32 pt-4 sm:px-6">{children}</main>
          </div>
          <Toasts />
        </StoreProvider>
      </body>
    </html>
  );
}
