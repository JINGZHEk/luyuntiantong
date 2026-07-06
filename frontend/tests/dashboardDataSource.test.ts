import {
  shouldAcceptDashboardUpdate,
  nextDashboardSource,
} from '../src/store/dashboardDataSource.js';

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(shouldAcceptDashboardUpdate('mock', 'mock', false), true);
assertEqual(shouldAcceptDashboardUpdate('mock', 'live', false), true);
assertEqual(shouldAcceptDashboardUpdate('live', 'live', true), true);
assertEqual(shouldAcceptDashboardUpdate('live', 'mock', true), false);
assertEqual(shouldAcceptDashboardUpdate('live', 'mock', false), true);

assertEqual(nextDashboardSource('mock', 'live'), 'live');
assertEqual(nextDashboardSource('live', 'mock'), 'mock');
