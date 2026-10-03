import { DEFAULT_PREFS, prefsOf, type WorkbenchStore, type Prefs } from "../domain/workbench-store.js";
import { parseWorkbenchPrefs, PREFS_KEY } from "../domain/preferences.js";

const CHANGE_EVENT = "readflow:workbench-preferences";
type StoragePort = Pick<Storage, "getItem" | "setItem"> | null | undefined;

export function preferenceEvents(storage: StoragePort): EventTarget | null {
  try { return typeof window !== "undefined" && storage === window.localStorage ? window : null; }
  catch { return null; }
}

export function syncWorkbenchPreferences(store: WorkbenchStore, storage: StoragePort, events: EventTarget | null, failed: (retry: () => Promise<void>) => void, apply: (next: Partial<Prefs>) => unknown = store.actions.patch) {
  let saved = JSON.stringify(prefsOf(store.getSnapshot()));
  const receive = (event: Event) => {
    const change = event as StorageEvent;
    if (event.type === "storage" && change.key !== PREFS_KEY && change.key !== null) return;
    if (event.type === "storage" && change.storageArea && change.storageArea !== storage) return;
    const raw = event.type === "storage" ? change.newValue : (event as CustomEvent<string>).detail;
    const incoming = raw === null ? DEFAULT_PREFS : parseWorkbenchPrefs(raw);
    const next = { ...prefsOf(store.getSnapshot()), ...incoming };
    const serialized = JSON.stringify(next);
    if (serialized === saved) return;
    // Mark before patching: incoming changes must not echo back to other windows.
    saved = serialized;
    apply(next);
  };
  const unsubscribe = store.subscribe((state) => {
    const next = JSON.stringify(prefsOf(state));
    if (next === saved) return;
    saved = next;
    const write = async () => { storage?.setItem(PREFS_KEY, next); };
    try { storage?.setItem(PREFS_KEY, next); }
    catch { failed(write); }
    if (events) {
      const EventConstructor = typeof window !== "undefined" && events === window ? window.CustomEvent : CustomEvent;
      events.dispatchEvent(new EventConstructor(CHANGE_EVENT, { detail: next }));
    }
  });
  events?.addEventListener("storage", receive);
  events?.addEventListener(CHANGE_EVENT, receive);
  return () => { unsubscribe(); events?.removeEventListener("storage", receive); events?.removeEventListener(CHANGE_EVENT, receive); };
}
