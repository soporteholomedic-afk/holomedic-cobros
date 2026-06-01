// @ts-nocheck
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  if (typeof document !== 'undefined' && document.body) {
    document.body.innerHTML = '';
  }
});
