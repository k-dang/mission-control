import { notFound } from "next/navigation";
import DevPageClient from "./DevPageClient";

export default function DevPage() {
  if (process.env.ENABLE_LOCAL_DEV_TOOLS !== "1") {
    notFound();
  }

  return <DevPageClient />;
}
