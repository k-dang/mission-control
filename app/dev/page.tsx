import { notFound } from "next/navigation";
import DevPageClient from "./DevPageClient";

export default function DevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DevPageClient />;
}
