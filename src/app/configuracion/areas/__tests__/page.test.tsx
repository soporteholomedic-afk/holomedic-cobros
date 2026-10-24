/**
 * Smoke test for the ÁREAS tab of `/configuracion` (feature
 * `configuracion-tabs`, S3 "AREAS (VISTA VACÍA)"): the tab ships as an
 * intentional EMPTY view until the areas CRUD exists.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import ConfiguracionAreasPage from '../page';

describe('/configuracion/areas page — vista vacía', () => {
  it('renderiza el placeholder con el título y el aviso de disponibilidad', () => {
    render(<ConfiguracionAreasPage />);
    expect(
      screen.getByRole('heading', { name: 'Áreas' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/todavía no está disponible/i),
    ).toBeInTheDocument();
  });
});
