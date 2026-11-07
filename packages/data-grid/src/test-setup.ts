import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom has no canvas, so text measuring falls back to a per-character estimate.
HTMLCanvasElement.prototype.getContext = () => null;
