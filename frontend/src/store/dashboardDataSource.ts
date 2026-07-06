export type DashboardDataSource = 'live' | 'mock';

export function shouldAcceptDashboardUpdate(
  currentSource: DashboardDataSource,
  incomingSource: DashboardDataSource,
  cloudConnected: boolean,
): boolean {
  if (incomingSource === 'live') return true;
  return !(currentSource === 'live' && cloudConnected);
}

export function nextDashboardSource(
  _currentSource: DashboardDataSource,
  incomingSource: DashboardDataSource,
): DashboardDataSource {
  return incomingSource;
}
