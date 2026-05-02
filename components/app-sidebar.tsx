"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import {
  CheckCircle2,
  Circle,
  Columns3,
  Menu,
  RadioTower,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const mainNav = [
  { href: "/", label: "Command Board", icon: Columns3 },
  { href: "/dev", label: "Dev Console", icon: RadioTower },
];

const statusNav = [
  { href: "/#todo", label: "Todo", icon: Circle },
  { href: "/#inprogress", label: "In Progress", icon: RadioTower },
  { href: "/#completed", label: "Completed", icon: CheckCircle2 },
];

function SidebarContent() {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-background/80">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/40 px-4">
        <div className="navbar-icon-ring flex h-8 w-8 items-center justify-center rounded-lg">
          <Zap className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-mono text-sm font-bold uppercase tracking-[0.14em] text-foreground">
              Mission Control
            </h1>
            <div className="status-beacon shrink-0" />
          </div>
          <p className="truncate font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
            Task orchestration system
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
            Navigation
          </p>
          {mainNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
                  isActive && "bg-muted text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="space-y-1">
          <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
            Task Lanes
          </p>
          {statusNav.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="flex min-h-14 items-center justify-between border-t border-border/40 px-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
          Operator
        </div>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-border/40 bg-background/95 md:block">
        <SidebarContent />
      </aside>

      <div className="fixed left-3 top-3 z-50 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 border-border/50 bg-background/95"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-80 border-r-border/50 bg-background p-0"
            showCloseButton={false}
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Main application navigation
            </SheetDescription>
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
