const LOCAL_STORAGE_EVENT = "app-localstorage-change";

type LocalStorageChangeDetail = {
  key: string | null;
  oldValue: string | null;
  newValue: string | null;
  source: "same-tab" | "cross-tab";
};

declare global {
  interface Window {
    __localStorageBridgeInstalled?: boolean;
  }
}

const dispatchLocalStorageChange = (detail: LocalStorageChangeDetail) => {
  window.dispatchEvent(new CustomEvent<LocalStorageChangeDetail>(LOCAL_STORAGE_EVENT, { detail }));
};

export const initLocalStorageEventBridge = () => {
  if (typeof window === "undefined") return;
  if (window.__localStorageBridgeInstalled) return;

  window.__localStorageBridgeInstalled = true;

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;

  Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
    const oldValue = this.getItem(key);
    originalSetItem.call(this, key, value);
    if (oldValue !== value) {
      dispatchLocalStorageChange({ key, oldValue, newValue: value, source: "same-tab" });
    }
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key: string) {
    const oldValue = this.getItem(key);
    originalRemoveItem.call(this, key);
    if (oldValue !== null) {
      dispatchLocalStorageChange({ key, oldValue, newValue: null, source: "same-tab" });
    }
  };

  Storage.prototype.clear = function patchedClear() {
    originalClear.call(this);
    dispatchLocalStorageChange({ key: null, oldValue: null, newValue: null, source: "same-tab" });
  };

  window.addEventListener("storage", (event) => {
    dispatchLocalStorageChange({
      key: event.key,
      oldValue: event.oldValue,
      newValue: event.newValue,
      source: "cross-tab",
    });
  });
};

export const subscribeLocalStorageKeys = (keys: string[], onChange: () => void) => {
  const tracked = new Set(keys);
  const handler = (event: Event) => {
    const custom = event as CustomEvent<LocalStorageChangeDetail>;
    const changedKey = custom.detail?.key ?? null;
    if (changedKey === null || tracked.has(changedKey)) {
      onChange();
    }
  };

  window.addEventListener(LOCAL_STORAGE_EVENT, handler);
  return () => window.removeEventListener(LOCAL_STORAGE_EVENT, handler);
};
