import { RiskItem } from '@/mock/dashboardMock';

export type SortField = 'riskScore' | 'ttc' | 'timestamp';

export function sortRiskItems(items: RiskItem[], sortBy: SortField): RiskItem[] {
  return [...items].sort((a, b) => {
    if (sortBy === 'riskScore') return b.riskScore - a.riskScore;
    if (sortBy === 'ttc') return a.ttc - b.ttc;
    return b.timestamp.localeCompare(a.timestamp);
  });
}
