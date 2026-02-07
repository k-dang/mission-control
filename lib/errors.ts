export function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof (error as { data?: unknown }).data === "object" &&
    (error as { data?: unknown }).data !== null &&
    "message" in ((error as { data?: unknown }).data as { message?: unknown }) &&
    typeof ((error as { data?: unknown }).data as { message?: unknown }).message ===
      "string"
  ) {
    return ((error as { data?: unknown }).data as { message: string }).message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
