import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DevPageClient from "./DevPageClient";

export const metadata: Metadata = {
  title: "Dev Tools · Mission Control",
  description: "Development-only diagnostics and smoke tests.",
};

export default function DevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DevPageClient />;
}
