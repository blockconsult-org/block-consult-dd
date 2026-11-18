import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppHeader } from "@/components/shell/app-header";
import { themeBootstrap } from "@/components/shell/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Due Diligence | Block Consult",
  description: "Evidence, risk assessment and investment reports for crypto, token, RWA and stablecoin opportunities.",
};

export const viewport: Viewport = {
  themeColor: "#08090a",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body className="flex min-h-screen flex-col bg-bg text-fg">
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8">{children}</main>
        <footer className="mx-auto w-full max-w-7xl px-4 pb-6 pt-8 text-xs leading-5 text-faint sm:px-6">
          <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <span className="shrink-0 font-medium text-muted">Block Consult GmbH</span>
            <p className="max-w-xl sm:text-right">Due diligence supports professional judgment. It is not legal, tax, accounting or investment advice.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
