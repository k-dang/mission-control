import { z } from "zod";

const convexErrorSchema = z.object({
  data: z.object({
    message: z.string(),
  }),
});

export function getErrorMessage(error: unknown): string {
  const parsed = convexErrorSchema.safeParse(error);
  if (parsed.success) {
    return parsed.data.data.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
