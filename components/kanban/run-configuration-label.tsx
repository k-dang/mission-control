import {
  describeRunConfiguration,
  type RunConfigurationInput,
} from "@/convex/lib/runConfiguration";

export function RunConfigurationLabel({
  runConfiguration,
}: {
  runConfiguration?: RunConfigurationInput | null;
}) {
  const label = describeRunConfiguration(runConfiguration);

  return (
    <span className="truncate font-mono text-[10px] text-muted-foreground/60">
      {label}
    </span>
  );
}
