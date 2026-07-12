// Native (iOS/Android) token storage for Convex Auth — backed by the OS keychain
// via expo-secure-store. (Metro uses this file on device; secureStorage.web.ts
// is used for the browser preview.)
import * as SecureStore from "expo-secure-store";

// expo-secure-store only allows keys matching [A-Za-z0-9._-]; sanitize to be safe.
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

export const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(safeKey(key)),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(safeKey(key), value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(safeKey(key)),
};
