"use client";

import {
  useState,
  useRef,
  useCallback,
  type DragEvent,
  type SubmitEvent,
} from "react";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/errors";
import {
  CREATE_TODO_DEFAULT_DESCRIPTION,
  CREATE_TODO_DEFAULT_GITHUB_URL,
  CREATE_TODO_DEFAULT_TITLE,
} from "@/lib/todo-defaults";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { TaskDetailPanel } from "@/components/kanban/task-detail-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  AlertCircle,
  Loader2,
} from "lucide-react";

const STAT_COLORS = {
  todo: "oklch(0.75 0.15 55)",
  inprogress: "oklch(0.65 0.17 250)",
  completed: "oklch(0.68 0.14 155)",
  failed: "oklch(0.58 0.22 25)",
};

const KANBAN_PAGE_SIZE = 25;

export default function Home() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const todoPage = usePaginatedQuery(
    api.todos.listByStatusPage,
    isAuthenticated ? { status: "TODO" } : "skip",
    { initialNumItems: KANBAN_PAGE_SIZE },
  );
  const inprogressPage = usePaginatedQuery(
    api.todos.listByStatusPage,
    isAuthenticated ? { status: "INPROGRESS" } : "skip",
    { initialNumItems: KANBAN_PAGE_SIZE },
  );
  const completedPage = usePaginatedQuery(
    api.todos.listByStatusPage,
    isAuthenticated ? { status: "COMPLETED" } : "skip",
    { initialNumItems: KANBAN_PAGE_SIZE },
  );
  const failedPage = usePaginatedQuery(
    api.todos.listByStatusPage,
    isAuthenticated ? { status: "FAILED" } : "skip",
    { initialNumItems: KANBAN_PAGE_SIZE },
  );
  const createTodo = useMutation(api.todos.create);
  const updateTodo = useMutation(api.todos.update);

  const [title, setTitle] = useState(CREATE_TODO_DEFAULT_TITLE);
  const [description, setDescription] = useState(
    CREATE_TODO_DEFAULT_DESCRIPTION,
  );
  const [githubUrl, setGithubUrl] = useState(CREATE_TODO_DEFAULT_GITHUB_URL);
  const [formError, setFormError] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTodoId, setSelectedTodoId] = useState<Id<"todos"> | null>(
    null,
  );
  const selectedTodo = useQuery(
    api.todos.get,
    isAuthenticated && selectedTodoId ? { todoId: selectedTodoId } : "skip",
  );
  const selectedSandbox = useQuery(
    api.todoSandboxes.getSandboxForTodo,
    isAuthenticated && selectedTodoId ? { todoId: selectedTodoId } : "skip",
  );
  const titleInputRef = useRef<HTMLInputElement>(null);
  const draggedTodoIdRef = useRef<Id<"todos"> | null>(null);

  const resetForm = useCallback(() => {
    setTitle(CREATE_TODO_DEFAULT_TITLE);
    setDescription(CREATE_TODO_DEFAULT_DESCRIPTION);
    setGithubUrl(CREATE_TODO_DEFAULT_GITHUB_URL);
    setFormError(null);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setDialogOpen(open);
      if (!open) resetForm();
    },
    [resetForm],
  );

  const handleCreateTodo = async (event: SubmitEvent<HTMLFormElement>) => {
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
        githubUrl: githubUrl.trim() ? githubUrl : undefined,
      });
      resetForm();
      setDialogOpen(false);
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
    draggedTodoIdRef.current = todoId;
    event.dataTransfer.setData("text/todo-id", todoId);
    event.dataTransfer.effectAllowed = "move";
    setDropError(null);
  };

  const handleDragEnd = () => {
    draggedTodoIdRef.current = null;
  };

  const handleDropOnInProgress = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropTargetActive(false);
    setDropError(null);

    const todoId = draggedTodoIdRef.current;
    draggedTodoIdRef.current = null;
    if (!todoId) {
      return;
    }

    try {
      await updateTodo({
        todoId,
        status: "INPROGRESS",
      });
    } catch (error: unknown) {
      setDropError(getErrorMessage(error));
    }
  };

  const handleCardClick = useCallback((todo: Doc<"todos">) => {
    setSelectedTodoId(todo._id);
  }, []);

  const todos = {
    todo: todoPage.results,
    inprogress: inprogressPage.results,
    completed: completedPage.results,
    failed: failedPage.results,
  };

  const selectedLoadedTodo =
    [...todos.todo, ...todos.inprogress, ...todos.completed, ...todos.failed].find(
      (t) => t._id === selectedTodoId,
    ) ?? null;
  const resolvedTodo = selectedTodo ?? selectedLoadedTodo;
  const isBoardLoading =
    todoPage.status === "LoadingFirstPage" ||
    inprogressPage.status === "LoadingFirstPage" ||
    completedPage.status === "LoadingFirstPage" ||
    failedPage.status === "LoadingFirstPage";

  // Auto-close sheet if the selected todo was deleted
  const sheetOpen = selectedTodoId !== null && resolvedTodo !== null;
  const isSelectedSandboxLoading =
    selectedTodoId !== null && selectedSandbox === undefined;

  if (isLoading) {
    return (
      <main className="grain-overlay relative flex min-h-screen flex-col md:h-dvh md:overflow-hidden">
        <div className="ambient-bg" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 p-6 pt-16 md:h-dvh md:min-h-0 md:overflow-hidden md:p-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 animate-pulse rounded-lg bg-muted/40" />
              <div className="h-8 w-48 animate-pulse rounded-lg bg-muted/40" />
            </div>
            <div className="h-10 w-full animate-pulse rounded-xl bg-muted/20" />
          </div>
          <div className="grid gap-5 md:grid-cols-4">
            {[0, 1, 2, 3].map((col) => (
              <div
                key={col}
                className="rounded-xl border border-border/30 bg-card/20 p-4"
              >
                <div className="mb-4 flex items-center gap-2">
                  <div className="h-7 w-7 animate-pulse rounded-lg bg-muted/30" />
                  <div className="h-4 w-24 animate-pulse rounded bg-muted/30" />
                </div>
                <div className="space-y-3">
                  {[0, 1].map((card) => (
                    <div
                      key={card}
                      className="h-16 animate-pulse rounded-lg bg-muted/15"
                      style={{ animationDelay: `${(col * 2 + card) * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (isBoardLoading) {
    return (
      <main className="grain-overlay relative flex min-h-screen flex-col md:h-dvh md:overflow-hidden">
        <div className="ambient-bg" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 p-6 pt-16 md:h-dvh md:min-h-0 md:overflow-hidden md:p-10">
          {/* Skeleton header */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 animate-pulse rounded-lg bg-muted/40" />
              <div className="h-8 w-48 animate-pulse rounded-lg bg-muted/40" />
            </div>
            <div className="h-10 w-full animate-pulse rounded-xl bg-muted/20" />
          </div>
          {/* Skeleton columns */}
          <div className="grid gap-5 md:grid-cols-4">
            {[0, 1, 2, 3].map((col) => (
              <div
                key={col}
                className="rounded-xl border border-border/30 bg-card/20 p-4"
              >
                <div className="mb-4 flex items-center gap-2">
                  <div className="h-7 w-7 animate-pulse rounded-lg bg-muted/30" />
                  <div className="h-4 w-24 animate-pulse rounded bg-muted/30" />
                </div>
                <div className="space-y-3">
                  {[0, 1].map((card) => (
                    <div
                      key={card}
                      className="h-16 animate-pulse rounded-lg bg-muted/15"
                      style={{ animationDelay: `${(col * 2 + card) * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="grain-overlay relative flex min-h-screen flex-col md:h-dvh md:overflow-hidden">
      <div className="ambient-bg" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full flex-col gap-8 p-6 pt-16 md:h-dvh md:min-h-0 md:overflow-hidden md:p-10">
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            {/* Stat pills */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: STAT_COLORS.todo }}
                />
                <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                  {todos.todo.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: STAT_COLORS.inprogress }}
                />
                <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                  {todos.inprogress.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: STAT_COLORS.completed }}
                />
                <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                  {todos.completed.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: STAT_COLORS.failed }}
                />
                <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                  {todos.failed.length}
                </span>
              </div>
            </div>
              <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
                <DialogTrigger asChild>
                  <Button variant="glow" size="sm">
                    <Plus className="h-4 w-4" />
                    New Task
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="border-border/50 bg-card"
                  onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    titleInputRef.current?.focus();
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>Create a new task</DialogTitle>
                    <DialogDescription>
                      Add a task to your TODO column.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    id="create-todo-form"
                    onSubmit={handleCreateTodo}
                    className="grid gap-4"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="create-todo-title"
                        className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
                      >
                        Title
                      </Label>
                      <Input
                        id="create-todo-title"
                        ref={titleInputRef}
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="What needs to be done?"
                        className="bg-background/50 border-border/50"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="create-todo-description"
                        className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
                      >
                        Description{" "}
                        <span className="normal-case tracking-normal text-muted-foreground/50">
                          (optional)
                        </span>
                      </Label>
                      <Textarea
                        id="create-todo-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Add details"
                        rows={3}
                        className="resize-none bg-background/50 border-border/50"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="create-todo-github-url"
                        className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
                      >
                        GitHub URL{" "}
                        <span className="normal-case tracking-normal text-muted-foreground/50">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        id="create-todo-github-url"
                        value={githubUrl}
                        onChange={(event) => setGithubUrl(event.target.value)}
                        placeholder="https://github.com/owner/repo"
                        type="url"
                        className="bg-background/50 border-border/50"
                      />
                    </div>
                    {formError ? (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <p>{formError}</p>
                      </div>
                    ) : null}
                  </form>
                  <DialogFooter>
                    <DialogTrigger asChild>
                      <Button variant="outline" disabled={isSubmitting}>
                        Cancel
                      </Button>
                    </DialogTrigger>
                    <Button
                      type="submit"
                      form="create-todo-form"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      {isSubmitting ? "Adding..." : "Add Task"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
          </div>
        </header>

        {dropError ? (
          <div
            className="flex items-center gap-2 text-sm text-destructive"
            role="status"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{dropError}</p>
          </div>
        ) : null}

        <section className="grid gap-5 md:min-h-0 md:flex-1 md:grid-cols-4 md:overflow-hidden">
          <KanbanColumn
            id="todo"
            status="TODO"
            todos={todos.todo}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onCardClick={handleCardClick}
            canLoadMore={todoPage.status === "CanLoadMore"}
            isLoadingMore={todoPage.status === "LoadingMore"}
            onLoadMore={() => todoPage.loadMore(KANBAN_PAGE_SIZE)}
          />
          <KanbanColumn
            id="inprogress"
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
            onCardClick={handleCardClick}
            canLoadMore={inprogressPage.status === "CanLoadMore"}
            isLoadingMore={inprogressPage.status === "LoadingMore"}
            onLoadMore={() => inprogressPage.loadMore(KANBAN_PAGE_SIZE)}
          />
          <KanbanColumn
            id="completed"
            status="COMPLETED"
            todos={todos.completed}
            draggable={false}
            onDragStart={handleDragStart}
            onCardClick={handleCardClick}
            canLoadMore={completedPage.status === "CanLoadMore"}
            isLoadingMore={completedPage.status === "LoadingMore"}
            onLoadMore={() => completedPage.loadMore(KANBAN_PAGE_SIZE)}
          />
          <KanbanColumn
            id="failed"
            status="FAILED"
            todos={todos.failed}
            draggable={false}
            onDragStart={handleDragStart}
            onCardClick={handleCardClick}
            canLoadMore={failedPage.status === "CanLoadMore"}
            isLoadingMore={failedPage.status === "LoadingMore"}
            onLoadMore={() => failedPage.loadMore(KANBAN_PAGE_SIZE)}
          />
        </section>
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedTodoId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full border-l-border/50 bg-card sm:max-w-lg"
          showCloseButton={true}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetTitle className="sr-only">
            {resolvedTodo?.title ?? "Task details"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            View and edit task details, status, and activity.
          </SheetDescription>
          {resolvedTodo && !isSelectedSandboxLoading && (
            <TaskDetailPanel
              key={resolvedTodo._id}
              todo={resolvedTodo}
              sandbox={selectedSandbox ?? null}
              onClose={() => setSelectedTodoId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
