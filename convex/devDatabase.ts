import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireAuthenticated } from "./authHelpers";

const DEV_TOOLS_DISABLED_ERROR =
  "Dev tools are disabled. Set CONVEX_DEV_TOOLS=true in Convex env to enable them.";
const CLEAR_BATCH_SIZE = 100;
const TABLES_TO_CLEAR = [
  "todoEvents",
  "toolCallCounts",
  "todoAttempts",
  "todos",
] as const;

function areDevToolsEnabled() {
  return process.env.CONVEX_DEV_TOOLS === "true";
}

const clearRecordsResultValidator = v.object({
  deleted: v.object({
    todos: v.number(),
    todoAttempts: v.number(),
    todoEvents: v.number(),
    toolCallCounts: v.number(),
  }),
  complete: v.boolean(),
});

async function clearRecordsBatch(ctx: MutationCtx) {
  const deleted = {
    todos: 0,
    todoAttempts: 0,
    todoEvents: 0,
    toolCallCounts: 0,
  };
  let reachedBatchLimit = false;

  for (const tableName of TABLES_TO_CLEAR) {
    if (reachedBatchLimit) {
      break;
    }

    const remainingCapacity =
      CLEAR_BATCH_SIZE -
      deleted.todos -
      deleted.todoAttempts -
      deleted.todoEvents -
      deleted.toolCallCounts;
    const rows = await ctx.db.query(tableName).take(remainingCapacity);

    for (const row of rows) {
      await ctx.db.delete(row._id);
      deleted[tableName] += 1;
    }

    reachedBatchLimit = rows.length === remainingCapacity;
  }

  return {
    deleted,
    complete: !reachedBatchLimit,
  };
}

function assertDevToolsEnabled() {
  if (!areDevToolsEnabled()) {
    throw new ConvexError({
      code: "DEV_TOOLS_DISABLED",
      message: DEV_TOOLS_DISABLED_ERROR,
    });
  }
}

export const clearRecords = mutation({
  args: {},
  returns: clearRecordsResultValidator,
  handler: async (ctx) => {
    await requireAuthenticated(ctx);
    assertDevToolsEnabled();

    return await clearRecordsBatch(ctx);
  },
});
