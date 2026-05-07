"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = !pathname.startsWith("/sign-in");

  return (
    <div className="flex min-h-screen">
      {showSidebar ? <AppSidebar /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
