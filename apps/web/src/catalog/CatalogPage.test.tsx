// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CatalogPage } from './CatalogPage.js';

afterEach(cleanup);

describe('navegación del catálogo de demostración', () => {
  it('permite abrir los cuatro títulos y muestra detalles ampliados cuando existen', () => {
    render(<CatalogPage />);

    const titles = ['La última frontera', 'Horizontes', 'El eco del tiempo', 'Ciudad invisible'];
    for (const title of titles) {
      fireEvent.click(screen.getByRole('button', { name: `Ver detalles de ${title}` }));
      expect(screen.getByRole('heading', { name: title, level: 1 })).toBeTruthy();
      if (title === 'La última frontera') {
        expect(screen.getByText('Elena Vega')).toBeTruthy();
      } else if (title === 'Horizontes') {
        expect(screen.getByRole('heading', { name: 'Temporadas' })).toBeTruthy();
      } else {
        expect(screen.getByText('Aún no hay información ampliada para este título.')).toBeTruthy();
      }
      fireEvent.click(screen.getByRole('button', { name: 'Volver a explorar' }));
    }
    expect(screen.getByRole('search')).toBeTruthy();
  });

  it('conserva búsqueda y filtro al regresar del detalle', () => {
    render(<CatalogPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Películas' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar películas o series' }), {
      target: { value: 'eco' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles de El eco del tiempo' }));
    expect(screen.getByRole('heading', { name: 'El eco del tiempo', level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a explorar' }));

    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('eco');
    expect(screen.getByRole('button', { name: 'Películas' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Ver detalles de El eco del tiempo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ver detalles de Ciudad invisible' })).toBeNull();
  });
});
