"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_RUN_CONFIGURATION,
  RUN_CONFIGURATION_PROVIDERS,
  type RunConfiguration,
  type RunConfigurationProviderId,
} from "@/convex/lib/runConfiguration";
import { AlertCircle, Loader2, Play } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StartRunDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (configuration: RunConfiguration) => void | Promise<void>;
  isStarting: boolean;
  error?: string | null;
  todoTitle?: string;
};

export function StartRunDialog({
  open,
  onOpenChange,
  onConfirm,
  isStarting,
  error,
  todoTitle,
}: StartRunDialogProps) {
  const [providerId, setProviderId] = useState<RunConfigurationProviderId>(
    DEFAULT_RUN_CONFIGURATION.providerId,
  );
  const selectedProvider = useMemo(
    () =>
      RUN_CONFIGURATION_PROVIDERS.find((provider) => provider.id === providerId) ??
      RUN_CONFIGURATION_PROVIDERS[0],
    [providerId],
  );
  const [modelId, setModelId] = useState<string>(
    DEFAULT_RUN_CONFIGURATION.modelId,
  );

  const handleProviderChange = (nextProviderId: string) => {
    const provider = RUN_CONFIGURATION_PROVIDERS.find(
      (candidate) => candidate.id === nextProviderId,
    );
    if (!provider) return;
    setProviderId(provider.id);
    setModelId(provider.models[0]?.id ?? "");
  };

  const selectedModel = selectedProvider.models.find(
    (model) => model.id === modelId,
  );
  const activeModelId = selectedModel?.id ?? selectedProvider.models[0]?.id ?? "";
  const canConfirm = Boolean(activeModelId) && !isStarting;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isStarting) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setProviderId(DEFAULT_RUN_CONFIGURATION.providerId);
      setModelId(DEFAULT_RUN_CONFIGURATION.modelId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle>Start task</DialogTitle>
          <DialogDescription>
            Choose the provider and main model for this run.
          </DialogDescription>
        </DialogHeader>

        {todoTitle ? (
          <div className="rounded-md border border-border/30 bg-background/30 px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">
              {todoTitle}
            </p>
          </div>
        ) : null}

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label
              htmlFor="start-run-provider"
              className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground"
            >
              Provider
            </Label>
            <Select
              value={providerId}
              disabled={isStarting}
              onValueChange={handleProviderChange}
            >
              <SelectTrigger
                id="start-run-provider"
                className="h-10 border-border/50 bg-background/50"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border/50 bg-card">
                {RUN_CONFIGURATION_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label
              htmlFor="start-run-model"
              className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground"
            >
              Main model
            </Label>
            <Select
              value={activeModelId}
              disabled={isStarting}
              onValueChange={setModelId}
            >
              <SelectTrigger
                id="start-run-model"
                className="h-10 border-border/50 bg-background/50"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border/50 bg-card">
                {selectedProvider.models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Models shown here are scoped to {selectedProvider.label}.
            </p>
          </div>

          {error ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isStarting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm({ providerId, modelId: activeModelId })}
          >
            {isStarting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isStarting ? "Starting..." : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
