# Todo Automation

This context describes how Todo Tasks become automated Attempts and how those Attempts are tracked.

## Language

**Todo Task**:
A unit of work that can be moved through the board lifecycle.
_Avoid_: Ticket, job

**Attempt**:
A single automated execution of a **Todo Task**, carried out by one **Harness**.
_Avoid_: Session, run (when referring to the execution itself), task (reserved for **Todo Task**)

**Run Configuration**:
The harness, provider, and model selection captured for a single **Attempt** at a **Todo Task**.
_Avoid_: Task preference, model setting

**Provider**:
The routing and account boundary used to run a model for a **Run Configuration**.
_Avoid_: Model vendor

**Sandbox**:
The execution environment for an active **Attempt** at a **Todo Task**.
_Avoid_: Task, todo

**Harness**:
The agent runtime that carries out an automated **Attempt** at a **Todo Task**.
_Avoid_: Agent (ambiguous with the model), SDK, runner

## Relationships

- A **Todo Task** may have at most one active **Attempt**, and retains that Attempt's **Run Configuration** after it ends.
- A **Run Configuration** belongs to exactly one **Attempt**.
- A **Run Configuration** selects exactly one **Harness**.
- A **Run Configuration** uses exactly one **Provider**; the **Providers** available to choose from are determined by the selected **Harness**.
- A **Run Configuration** governs only what the **Harness** does during an **Attempt**; work the system performs around the Attempt (such as writing pull-request metadata) is not governed by it.
- A **Sandbox** belongs to exactly one **Attempt**.
- An **Attempt** is executed by exactly one **Harness** and may use a **Sandbox** as its execution environment.

## Example Dialogue

> **Dev:** "Can the user change the model after a **Todo Task** starts?"
> **Domain expert:** "No — the **Run Configuration** is captured when the task moves into progress."

## Flagged Ambiguities

- "Provider/model for a todo" could mean a saved task preference or a per-attempt choice — resolved: use **Run Configuration** for the per-attempt choice captured at start.
- "Provider" could mean the company that created the model or the service account that routes the request — resolved: use **Provider** as the routing and account boundary.
- Historical attempts may not have a recorded **Run Configuration** — resolved: display them as "Unknown run configuration."
- "Harness" could include vendor-hosted execution (e.g. Cursor cloud mode) — reopened: whether a **Harness** must execute inside a **Sandbox** is decided per harness when it is implemented. OpenCode, the only implemented **Harness**, runs inside the **Sandbox** today.
- "OpenCode" names two different things — resolved: unqualified **OpenCode** always means the **Harness**; the **Provider** operated by the same company is always written **OpenCode Zen**, never shortened.
