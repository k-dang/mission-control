# Todo Automation

This context describes how todo tasks become automated coding runs and how those runs are tracked.

## Language

**Todo Task**:
A unit of work that can be moved through the board lifecycle.
_Avoid_: Ticket, job

**Run Configuration**:
The provider and model selection captured for a single automated attempt at a **Todo Task**.
_Avoid_: Task preference, model setting

**Provider**:
The routing and account boundary used to run a model for a **Run Configuration**.
_Avoid_: Model vendor

**Sandbox**:
The execution environment for an active automated attempt at a **Todo Task**.
_Avoid_: Task, todo

## Relationships

- A **Todo Task** may have at most one active **Run Configuration** while it is in progress and retains that configuration after the attempt ends.
- A **Run Configuration** belongs to exactly one **Todo Task** attempt.
- A **Run Configuration** uses exactly one **Provider**.
- A **Sandbox** belongs to one active automated attempt at a **Todo Task**.

## Example Dialogue

> **Dev:** "Can the user change the model after a **Todo Task** starts?"
> **Domain expert:** "No — the **Run Configuration** is captured when the task moves into progress."

## Flagged Ambiguities

- "Provider/model for a todo" could mean a saved task preference or a per-attempt choice — resolved: use **Run Configuration** for the per-attempt choice captured at start.
- "Provider" could mean the company that created the model or the service account that routes the request — resolved: use **Provider** as the routing and account boundary.
- Historical attempts may not have a recorded **Run Configuration** — resolved: display them as "Unknown run configuration."
