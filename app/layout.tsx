import type { Metadata } from "next";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Geist, Geist_Mono } from "next/font/google";
import { Zap } from "lucide-react";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";

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
  icons: {
    icon: "/convex.svg",
  },
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
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ConvexClientProvider>
            <nav className="navbar-glow sticky top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-2xl">
              <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3 md:px-10">
                <div className="flex items-center gap-3">
                  <div className="navbar-icon-ring flex h-8 w-8 items-center justify-center rounded-lg">
                    <Zap className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <h1 className="font-mono text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                        Mission Control
                      </h1>
                      <div className="status-beacon" />
                    </div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
                      Task orchestration system
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Show when="signed-in">
                    <UserButton />
                  </Show>
                </div>
              </div>
            </nav>
            {children}
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
