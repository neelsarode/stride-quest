/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as combat from "../combat.js";
import type * as dev from "../dev.js";
import type * as economy from "../economy.js";
import type * as fuel from "../fuel.js";
import type * as fuelMath from "../fuelMath.js";
import type * as game from "../game.js";
import type * as gameConfig from "../gameConfig.js";
import type * as guild from "../guild.js";
import type * as http from "../http.js";
import type * as idle from "../idle.js";
import type * as overdrive from "../overdrive.js";
import type * as players from "../players.js";
import type * as rally from "../rally.js";
import type * as shields from "../shields.js";
import type * as steps from "../steps.js";
import type * as streak from "../streak.js";
import type * as streakMath from "../streakMath.js";
import type * as time from "../time.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  combat: typeof combat;
  dev: typeof dev;
  economy: typeof economy;
  fuel: typeof fuel;
  fuelMath: typeof fuelMath;
  game: typeof game;
  gameConfig: typeof gameConfig;
  guild: typeof guild;
  http: typeof http;
  idle: typeof idle;
  overdrive: typeof overdrive;
  players: typeof players;
  rally: typeof rally;
  shields: typeof shields;
  steps: typeof steps;
  streak: typeof streak;
  streakMath: typeof streakMath;
  time: typeof time;
  users: typeof users;
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
