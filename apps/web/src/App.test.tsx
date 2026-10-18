import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('pantalla inicial', () => {
  it('muestra el nombre del producto y un mensaje de bienvenida', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('GarquinsFilm');
    expect(markup).toContain('Tu espacio para películas y series');
  });
});
