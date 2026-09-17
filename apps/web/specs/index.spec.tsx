import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import Page from '../src/app/page';

vi.mock('eve/react', () => ({
  useEveAgent: () => ({
    data: { messages: [] },
    error: undefined,
    send: vi.fn<() => Promise<void>>(),
    status: 'ready',
  }),
}));

describe('Page', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<Page />);
    expect(baseElement).toBeTruthy();
    expect(baseElement.textContent).toContain('Available players');
    expect(baseElement.textContent).toContain('Draft chat');
  });
});
