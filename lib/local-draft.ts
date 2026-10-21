"use client";

import { useCallback, useEffect, useState } from "react";

const PREFIX = "sdbp:draft:";

export function useLocalDraft<T>(key: string, initialValue: T) {
  const storageKey = `${PREFIX}${key}`;
  const [value, setValue] = useState<T>(initialValue);
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => {
    setValue(readDraft(storageKey, initialValue));
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Draft persistence is a convenience. The form must remain usable if storage is unavailable.
    }
  }, [loadedKey, storageKey, value]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore unavailable browser storage.
    }
    setValue(initialValue);
  }, [storageKey, initialValue]);

  return [value, setValue, clear] as const;
}

export function hasLocalDraft(key: string) {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return false;
    const value = JSON.parse(raw);
    if (typeof value === "string") return Boolean(value.trim());
    if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some((item) => {
      if (typeof item === "string") return Boolean(item.trim());
      if (Array.isArray(item)) return item.length > 0;
      return item != null;
    });
    return Boolean(value);
  } catch {
    return false;
  }
}

function readDraft<T>(storageKey: string, initialValue: T): T {
  if (typeof window === "undefined") return initialValue;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as T : initialValue;
  } catch {
    return initialValue;
  }
}
