import { ConvexError } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

export async function requireAuthenticated(
  ctx: QueryCtx | MutationCtx | ActionCtx,
) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to access this data.",
    });
  }

  return identity;
}
