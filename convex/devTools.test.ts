/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

it("rejects unauthenticated Pi smoke Sandbox access before provisioning", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.action(api.devTools.startPiSmokeSandbox, { providerId: "openrouter" }),
  ).rejects.toThrow("You must be signed in to access this data.");

  await expect(
    t.action(api.devTools.monitorPiSmokeSandbox, {
      sandboxId: "sandbox_untrusted",
      commandId: "command_untrusted",
    }),
  ).rejects.toThrow("You must be signed in to access this data.");
});
