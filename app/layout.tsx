import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { AppShell } from "@/components/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mission Control",
  description: "AI-powered task orchestration system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {process.env.NODE_ENV === "development" ? (
          <Script
            src="https://cdn.jsdelivr.net/npm/react-scan/dist/auto.global.js"
            strategy="beforeInteractive"
            crossOrigin="anonymous"
          />
        ) : null}
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ConvexClientProvider>
            <AppShell>{children}</AppShell>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
