import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Sign in · Mission Control",
  description: "Sign in to Mission Control.",
};

export default function SignInPage() {
  return (
    <main className="grain-overlay relative flex min-h-[calc(100vh-65px)] items-center justify-center overflow-hidden px-6 py-10">
      <div className="ambient-bg" />
      <div className="relative z-10 flex w-full max-w-md justify-center">
        <SignIn />
      </div>
    </main>
  );
}
