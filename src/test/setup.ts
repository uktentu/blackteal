import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

/**
 * jsdom implements neither of these, and both are used by the diagram: ResizeObserver drives
 * the tooltip anchor, and getBoundingClientRect returns zeros so overlays have no size to
 * position against. Stubbed rather than mocked away, so component tests exercise the real
 * render path.
 */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
