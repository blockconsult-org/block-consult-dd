import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppShell } from "@/components/shell/app-shell";
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
