import type { Metadata } from "next";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Geist, Geist_Mono } from "next/font/google";
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
            <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
              <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3 md:px-10">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    Authentication
                  </p>
                  <p className="text-sm text-foreground">
                    Clerk is active in the app router.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Show when="signed-in">
                    <UserButton />
                  </Show>
                </div>
              </div>
            </div>
            {children}
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
