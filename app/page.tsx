"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/errors";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import {
  Plus,
  Newspaper,
  AlertCircle,
  Loader2,
} from "lucide-react";

export default function Home() {
  const todos = useQuery(api.myFunctions.listTodos);
  const createTodo = useMutation(api.myFunctions.createTodo);
  const moveTodoToInProgress = useMutation(api.myFunctions.moveTodoToInProgress);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);

  const handleCreateTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createTodo({
        title,
        description: description.trim() ? description : undefined,
      });
      setTitle("");
      setDescription("");
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    todoId: Id<"todos">,
  ) => {
    event.dataTransfer.setData("text/todo-id", todoId);
    event.dataTransfer.effectAllowed = "move";
    setDropError(null);
  };

  const handleDropOnInProgress = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropTargetActive(false);
    setDropError(null);

    const todoId = event.dataTransfer.getData("text/todo-id");
    if (!todoId) {
      return;
    }

    try {
      await moveTodoToInProgress({ todoId: todoId as Id<"todos"> });
    } catch (error: unknown) {
      setDropError(getErrorMessage(error));
    }
  };

  if (!todos) {
    return (
      <main className="grain-overlay flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="font-sans text-sm">Loading board&hellip;</p>
        </div>
      </main>
    );
  }

  return (
    <main className="grain-overlay mx-auto flex min-h-screen max-w-6xl flex-col gap-8 p-6 md:p-10">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <Newspaper className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            The Board
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Create tasks in{" "}
          <span className="font-medium text-col-todo">TODO</span> and drag them
          to{" "}
          <span className="font-medium text-col-inprogress">IN PROGRESS</span>.
        </p>
      </header>

      <form
        onSubmit={handleCreateTodo}
        className="glass-card rounded-xl p-5"
      >
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Title
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to be done?"
              className="rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Description{" "}
              <span className="normal-case tracking-normal text-muted-foreground/50">
                (optional)
              </span>
            </span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add details"
              className="rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {isSubmitting ? "Adding..." : "Add Task"}
          </button>
        </div>
        {formError ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{formError}</p>
          </div>
        ) : null}
      </form>

      {dropError ? (
        <div
          className="flex items-center gap-2 text-sm text-destructive"
          role="status"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{dropError}</p>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <KanbanColumn
          status="TODO"
          todos={todos.todo}
          draggable
          onDragStart={handleDragStart}
        />
        <KanbanColumn
          status="INPROGRESS"
          todos={todos.inprogress}
          draggable={false}
          onDragStart={handleDragStart}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDropTargetActive(true);
          }}
          onDragLeave={() => setIsDropTargetActive(false)}
          onDrop={handleDropOnInProgress}
          isDropTarget={isDropTargetActive}
        />
        <KanbanColumn
          status="COMPLETED"
          todos={todos.completed}
          draggable={false}
          onDragStart={handleDragStart}
        />
      </section>
    </main>
  );
}
