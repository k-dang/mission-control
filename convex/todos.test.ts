/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "user_1" };

describe("listByStatusPage", () => {
  it("projects internal deletion state out of board results", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    await t.run(async (ctx) => {
      await ctx.db.insert("todos", {
        title: "Deleting task",
        status: "INPROGRESS",
        deleting: true,
      });
    });

    await expect(
      authed.query(api.todos.listByStatusPage, {
        status: "INPROGRESS",
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      page: [{ title: "Deleting task", status: "INPROGRESS" }],
    });
  });
});
