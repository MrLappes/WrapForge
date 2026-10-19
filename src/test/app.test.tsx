import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import sampleManifest from '../../assets/sample-vehicle/manifest.json';

vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('sample-vehicle/manifest.json')) {
      return new Response(JSON.stringify(sampleManifest), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }),
);

describe('application shell', () => {
  it('renders the home screen and creates a sample project', async () => {
    render(<App />);
    expect(await screen.findByText(/Design the wrap/i)).toBeTruthy();
    const input = screen.getByLabelText('Project name');
    const buttons = screen.getAllByRole('button', { name: /Create project/i });
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.change(input, { target: { value: 'Test wrap' } });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Vehicle setup/i })).toBeTruthy();
    });
    expect(screen.getAllByText('Hood').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CC0-1.0').length).toBeGreaterThan(0);
  });
});
