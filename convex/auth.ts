// =============================================================================
// Convex Auth setup — anonymous identity.
// =============================================================================
// The Anonymous provider gives every player a real, permanent user row with NO
// login screen. Later we can add Apple Sign In / email to the `providers` array
// and link them onto the SAME user — so nobody loses their progress.
// =============================================================================

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous],
});
