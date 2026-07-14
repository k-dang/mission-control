export function buildTodoPrompt(
  title: string,
  description?: string,
  githubUrl?: string,
) {
  const lines = ["Task:", title.trim()];

  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    lines.push("", "Additional context:", trimmedDescription);
  }

  if (githubUrl?.trim()) {
    lines.push("", "Repository:", githubUrl.trim());
  }

  lines.push(
    "",
    "Expected workflow:",
    "1. Understand the codebase before editing.",
    "2. Make the code changes needed to complete the task.",
    "3. Run the most relevant validation for the files you change.",
  );

  return lines.join("\n");
}
