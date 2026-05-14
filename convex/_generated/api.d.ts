/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authHelpers from "../authHelpers.js";
import type * as devTools from "../devTools.js";
import type * as lib_github from "../lib/github.js";
import type * as lib_opencodeConfig from "../lib/opencodeConfig.js";
import type * as lib_opencodeEventProjector from "../lib/opencodeEventProjector.js";
import type * as lib_opencodeHealth from "../lib/opencodeHealth.js";
import type * as lib_opencodeSandbox from "../lib/opencodeSandbox.js";
import type * as lib_opencodeStreamMonitor from "../lib/opencodeStreamMonitor.js";
import type * as lib_pullRequest from "../lib/pullRequest.js";
import type * as lib_sandboxHelpers from "../lib/sandboxHelpers.js";
import type * as lib_todoEventValidator from "../lib/todoEventValidator.js";
import type * as notifications from "../notifications.js";
import type * as opencode from "../opencode.js";
import type * as opencodeToolCallCounts from "../opencodeToolCallCounts.js";
import type * as sandbox from "../sandbox.js";
import type * as todoEvents from "../todoEvents.js";
import type * as todoSandboxes from "../todoSandboxes.js";
import type * as todoSessionState from "../todoSessionState.js";
import type * as todos from "../todos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authHelpers: typeof authHelpers;
  devTools: typeof devTools;
  "lib/github": typeof lib_github;
  "lib/opencodeConfig": typeof lib_opencodeConfig;
  "lib/opencodeEventProjector": typeof lib_opencodeEventProjector;
  "lib/opencodeHealth": typeof lib_opencodeHealth;
  "lib/opencodeSandbox": typeof lib_opencodeSandbox;
  "lib/opencodeStreamMonitor": typeof lib_opencodeStreamMonitor;
  "lib/pullRequest": typeof lib_pullRequest;
  "lib/sandboxHelpers": typeof lib_sandboxHelpers;
  "lib/todoEventValidator": typeof lib_todoEventValidator;
  notifications: typeof notifications;
  opencode: typeof opencode;
  opencodeToolCallCounts: typeof opencodeToolCallCounts;
  sandbox: typeof sandbox;
  todoEvents: typeof todoEvents;
  todoSandboxes: typeof todoSandboxes;
  todoSessionState: typeof todoSessionState;
  todos: typeof todos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
