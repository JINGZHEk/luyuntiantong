import { fireEvent, render, screen } from '@testing-library/react';
import { RiskList } from '@/widgets/risk-list/RiskList';
import { RiskItem } from '@/mock/dashboardMock';

const items: RiskItem[] = [
  {
    id: 'risk-low',
    target: 'PED-LOW',
    type: 'pedestrian',
    riskLevel: 'low',
    riskScore: 0.2,
    ttc: 6,
    location: '路口A-东侧',
    timestamp: '2026-08-02 10:00:00',
  },
  {
    id: 'risk-critical',
    target: 'PED-CRITICAL',
    type: 'pedestrian',
    riskLevel: 'critical',
    riskScore: 0.95,
    ttc: 1.2,
    location: '路口A-中央',
    timestamp: '2026-08-02 10:00:01',
  },
];

describe('RiskList', () => {
  it('sorts by risk score by default and exposes critical state', () => {
    render(<RiskList items={items} />);

    const listItems = screen.getAllByRole('listitem');
    expect(listItems[0]).toHaveTextContent('PED-CRITICAL');
    expect(listItems[0]).toHaveAttribute('data-risk-level', 'critical');
  });

  it('sorts by TTC when the TTC control is pressed', () => {
    render(<RiskList items={items} />);

    fireEvent.click(screen.getByRole('button', { name: 'TTC' }));
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('PED-CRITICAL');
    expect(screen.getByRole('button', { name: 'TTC' })).toHaveAttribute('aria-pressed', 'true');
  });
});
