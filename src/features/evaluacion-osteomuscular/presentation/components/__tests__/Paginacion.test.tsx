import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Paginacion } from '../Paginacion';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('Paginacion (evaluation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a button for each page defined in the evaluation constants (4)', () => {
    render(<Paginacion paginaActual={2} baseUrl="/areas/musculoesqueletica/jjc/AT-1/evaluacion" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveTextContent('1');
    expect(buttons[1]).toHaveTextContent('2');
    expect(buttons[2]).toHaveTextContent('3');
    expect(buttons[3]).toHaveTextContent('4');
  });

  it('disables the current page button and styles it as active', () => {
    render(<Paginacion paginaActual={2} baseUrl="/areas/musculoesqueletica/jjc/AT-1/evaluacion" />);
    expect(screen.getByRole('button', { name: '2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '2' }).className).toContain('bg-[#0070c0]');
    expect(screen.getByRole('button', { name: '1' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '3' })).not.toBeDisabled();
  });

  it('navigates to page 1 (base URL without suffix) when clicking button 1', async () => {
    const user = userEvent.setup();
    render(<Paginacion paginaActual={2} baseUrl="/areas/musculoesqueletica/jjc/AT-1/evaluacion" />);
    await user.click(screen.getByRole('button', { name: '1' }));
    expect(push).toHaveBeenCalledWith('/areas/musculoesqueletica/jjc/AT-1/evaluacion');
  });

  it('navigates to page 3 (/pagina3) when clicking button 3', async () => {
    const user = userEvent.setup();
    render(<Paginacion paginaActual={1} baseUrl="/areas/musculoesqueletica/jjc/AT-1/evaluacion" />);
    await user.click(screen.getByRole('button', { name: '3' }));
    expect(push).toHaveBeenCalledWith('/areas/musculoesqueletica/jjc/AT-1/evaluacion/pagina3');
  });

  it('navigates to page 4 (/pagina4) when clicking button 4', async () => {
    const user = userEvent.setup();
    render(<Paginacion paginaActual={1} baseUrl="/areas/musculoesqueletica/jjc/AT-1/evaluacion" />);
    await user.click(screen.getByRole('button', { name: '4' }));
    expect(push).toHaveBeenCalledWith('/areas/musculoesqueletica/jjc/AT-1/evaluacion/pagina4');
  });

  it('does not navigate when clicking the already active page', async () => {
    const user = userEvent.setup();
    render(<Paginacion paginaActual={2} baseUrl="/areas/musculoesqueletica/jjc/AT-1/evaluacion" />);
    await user.click(screen.getByRole('button', { name: '2' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('calls onChange instead of router.push when onChange is provided', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Paginacion paginaActual={1} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '2' }));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(push).not.toHaveBeenCalled();
  });

  it('renders nothing when totalPaginas is zero', () => {
    const { container } = render(
      <Paginacion totalPaginas={0} paginaActual={1} baseUrl="/test" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
