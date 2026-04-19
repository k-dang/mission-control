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
import type * as lib_opencodeHelpers from "../lib/opencodeHelpers.js";
import type * as lib_pullRequest from "../lib/pullRequest.js";
import type * as lib_sandboxHelpers from "../lib/sandboxHelpers.js";
import type * as opencode from "../opencode.js";
import type * as sandbox from "../sandbox.js";
import type * as todoNotifications from "../todoNotifications.js";
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
  "lib/opencodeHelpers": typeof lib_opencodeHelpers;
  "lib/pullRequest": typeof lib_pullRequest;
  "lib/sandboxHelpers": typeof lib_sandboxHelpers;
  opencode: typeof opencode;
  sandbox: typeof sandbox;
  todoNotifications: typeof todoNotifications;
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
