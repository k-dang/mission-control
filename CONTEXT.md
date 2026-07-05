# Todo Automation

This context describes how todo tasks become automated coding runs and how those runs are tracked.

## Language

**Todo Task**:
A unit of work that can be moved through the board lifecycle.
_Avoid_: Ticket, job

**Attempt**:
A single automated execution of a **Todo Task**, carried out by one **Harness** inside one **Sandbox**.
_Avoid_: Session, run (when referring to the execution itself), task (reserved for **Todo Task**)

**Run Configuration**:
The harness, provider, and model selection captured for a single automated attempt at a **Todo Task**.
_Avoid_: Task preference, model setting

**Provider**:
The routing and account boundary used to run a model for a **Run Configuration**.
_Avoid_: Model vendor

**Sandbox**:
The execution environment for an active automated attempt at a **Todo Task**.
_Avoid_: Task, todo

**Harness**:
The agent runtime installed inside a **Sandbox** that carries out the automated attempt. An agent that executes outside the **Sandbox** (e.g. a vendor-hosted VM) is not a **Harness**.
_Avoid_: Agent (ambiguous with the model), SDK, runner

## Relationships

- A **Todo Task** may have at most one active **Attempt**, and retains that Attempt's **Run Configuration** after it ends.
- A **Run Configuration** belongs to exactly one **Attempt**.
- A **Run Configuration** selects exactly one **Harness**.
- A **Run Configuration** uses exactly one **Provider**; the **Providers** available to choose from are determined by the selected **Harness**.
- A **Sandbox** belongs to exactly one **Attempt**.
- A **Sandbox** runs exactly one **Harness** for its **Attempt**.

## Example Dialogue

> **Dev:** "Can the user change the model after a **Todo Task** starts?"
> **Domain expert:** "No — the **Run Configuration** is captured when the task moves into progress."

## Flagged Ambiguities

- "Provider/model for a todo" could mean a saved task preference or a per-attempt choice — resolved: use **Run Configuration** for the per-attempt choice captured at start.
- "Provider" could mean the company that created the model or the service account that routes the request — resolved: use **Provider** as the routing and account boundary.
- Historical attempts may not have a recorded **Run Configuration** — resolved: display them as "Unknown run configuration."
- "Harness" could include vendor-hosted execution (e.g. Cursor cloud mode) — resolved: a **Harness** runs inside the **Sandbox**; external execution services are a different concept and out of scope.
