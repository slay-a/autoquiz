import { expect, afterEach, vi, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ---------------------------------------------------------------------------
// localStorage polyfill for happy-dom v20 + vitest v1.6
//
// happy-dom exposes a file-backed localStorage stub when no --localstorage-file
// path is provided, resulting in setItem/getItem/clear being undefined.
// We replace it with a full in-memory Map-backed implementation.
// ---------------------------------------------------------------------------
beforeAll(() => {
  if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
    const store = new Map();
    const localStorageMock = {
      get length() { return store.size; },
      setItem(key, value) { store.set(String(key), String(value)); },
      getItem(key) { return store.has(String(key)) ? store.get(String(key)) : null; },
      removeItem(key) { store.delete(String(key)); },
      clear() { store.clear(); },
      key(index) {
        const keys = Array.from(store.keys());
        return keys[index] ?? null;
      },
    };
    // Make it iterable (for Object.keys(localStorage))
    Object.setPrototypeOf(localStorageMock, {
      ...localStorageMock,
      [Symbol.iterator]() {
        return store.entries();
      },
    });
    // Proxy to support Object.keys() enumeration
    const proxy = new Proxy(localStorageMock, {
      ownKeys() {
        return Array.from(store.keys());
      },
      getOwnPropertyDescriptor(target, key) {
        if (store.has(String(key))) {
          return { value: store.get(String(key)), writable: true, enumerable: true, configurable: true };
        }
        return Object.getOwnPropertyDescriptor(target, key);
      },
      get(target, key) {
        if (typeof key === 'string' && store.has(key) && !(key in target)) {
          return store.get(key);
        }
        const val = target[key];
        return typeof val === 'function' ? val.bind(target) : val;
      },
    });
    vi.stubGlobal('localStorage', proxy);
  }
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  // Safe clear — works with both real and polyfilled localStorage
  if (typeof localStorage.clear === 'function') {
    localStorage.clear();
  } else {
    Object.keys(localStorage).forEach((key) => localStorage.removeItem(key));
  }
  vi.clearAllMocks();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
