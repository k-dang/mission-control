"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_RUN_CONFIGURATION,
  parseRunConfiguration,
  type RunConfiguration,
  type RunConfigurationInput,
} from "@/convex/lib/runConfiguration";
import { getErrorMessage } from "@/lib/errors";

type StartTodoRequest = {
  todoId: Id<"todos">;
  title: string;
  runConfiguration: RunConfiguration;
};

type StartableTodo = Pick<Doc<"todos">, "_id" | "title"> & {
  runConfiguration?: RunConfigurationInput;
};

export function useStartTodoRun() {
  const startTodo = useMutation(api.todoRuns.start);
  const [request, setRequest] = useState<StartTodoRequest | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const requestStart = useCallback((todo: StartableTodo) => {
    setError(null);
    const parsedRunConfiguration = todo.runConfiguration
      ? parseRunConfiguration(todo.runConfiguration)
      : null;
    setRequest({
      todoId: todo._id,
      title: todo.title,
      runConfiguration:
        parsedRunConfiguration?.ok
          ? parsedRunConfiguration.value
          : DEFAULT_RUN_CONFIGURATION,
    });
    setRequestKey((key) => key + 1);
  }, []);

  const setDialogOpen = useCallback(
    (open: boolean) => {
      if (open || isStarting) return;
      setRequest(null);
      setError(null);
    },
    [isStarting],
  );

  const confirmStart = useCallback(
    async (runConfiguration: RunConfiguration) => {
      if (!request) return;

      setIsStarting(true);
      setError(null);
      try {
        await startTodo({ todoId: request.todoId, runConfiguration });
        setRequest(null);
      } catch (caughtError: unknown) {
        setError(getErrorMessage(caughtError));
      } finally {
        setIsStarting(false);
      }
    },
    [request, startTodo],
  );

  return {
    dialogKey: requestKey,
    dialogProps: {
      open: request !== null,
      onOpenChange: setDialogOpen,
      onConfirm: confirmStart,
      isStarting,
      error,
      todoTitle: request?.title,
      initialRunConfiguration: request?.runConfiguration,
    },
    error,
    isStarting,
    requestStart,
  };
}
