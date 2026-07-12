// Browser token storage for Convex Auth — backed by localStorage. Used only for
// the web preview; the native build uses secureStorage.ts (OS keychain).
export const secureStorage = {
  getItem: async (key: string) =>
    typeof localStorage !== "undefined" ? localStorage.getItem(key) : null,
  setItem: async (key: string, value: string) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};
