import { useCallback, useSyncExternalStore } from "react";

const PREFIX = "cockpit:note:";

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function readNote(key: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

function writeNote(key: string, value: string) {
  try {
    if (value.trim()) localStorage.setItem(PREFIX + key, value);
    else localStorage.removeItem(PREFIX + key);
    emit();
  } catch {
    /* ignore quota errors */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIX)) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useNote(key: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readNote(key),
    () => ""
  );
  const setValue = useCallback((v: string) => writeNote(key, v), [key]);
  return [value, setValue];
}
