import { it, expect } from 'vitest';
it('localStorage type check', () => {
  console.log('setItem type:', typeof localStorage.setItem);
  console.log('getItem type:', typeof localStorage.getItem);
  console.log('clear type:', typeof localStorage.clear);
  expect(typeof localStorage.setItem).toBe('function');
});
