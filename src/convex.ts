// Convex client. The URL is injected at build time from .env.local as
// EXPO_PUBLIC_CONVEX_URL — which `npx convex dev` writes for you automatically.
// If it's missing we expose `null` and the app shows a friendly setup screen
// instead of crashing.
import { ConvexReactClient } from "convex/react";

export const convexUrl: string | undefined = process.env.EXPO_PUBLIC_CONVEX_URL;

export const convex = convexUrl
  ? new ConvexReactClient(convexUrl)
  : null;
