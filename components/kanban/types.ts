import type { Doc } from "@/convex/_generated/dataModel";
import type { RunConfigurationInput } from "@/convex/lib/runConfiguration";

export type BoardTodo = Doc<"todos"> & {
  runConfiguration?: RunConfigurationInput;
};
