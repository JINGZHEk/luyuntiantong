import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ZhiluWujiePreviewPage from '../src/pages/zhiluwujie-preview/ZhiluWujiePreviewPage';

vi.mock('../src/pages/zhiluwujie/ZhiluWujiePage', () => ({
  default: () => <div data-testid="mock-zhiluwujie-scene" />,
}));

describe('3D screen preview controls', () => {
  it('keeps skin controls folded until the presenter opens them', () => {
    render(
      <MemoryRouter initialEntries={['/zhiluwujie-preview?skin=c']}>
        <ZhiluWujiePreviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '显示视觉设置' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /A\s*自然日间/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '显示视觉设置' }));

    expect(screen.getByRole('button', { name: /A\s*自然日间/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '隐藏视觉设置' })).toBeInTheDocument();
  });
});
