// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { MediaVideo } from '@garquinsfilm/shared';
import { TrailerModal } from './TrailerModal.js';

const trailer: MediaVideo = {
  id: 'demo-video',
  name: 'Tráiler oficial',
  site: 'YouTube',
  key: 'fictional-key',
  type: 'Trailer',
  official: true,
  language: 'es',
  url: 'https://www.youtube.com/watch?v=fictional-key',
  embedUrl: 'https://www.youtube-nocookie.com/embed/fictional-key',
};

afterEach(cleanup);

describe('TrailerModal', () => {
  it('solo monta el iframe tras una acción explícita y cierra con Escape restaurando el foco', () => {
    render(<TrailerModal video={trailer} title="Película de prueba" />);
    const trigger = screen.getByRole('button', { name: 'Ver tráiler' });
    trigger.focus();

    expect(screen.queryByTitle('Tráiler de Película de prueba')).toBeNull();
    fireEvent.click(trigger);

    const iframe = screen.getByTitle('Tráiler de Película de prueba') as HTMLIFrameElement;
    const close = screen.getByRole('button', { name: 'Cerrar tráiler de Película de prueba' });
    expect(iframe.getAttribute('src')).toBe(trailer.embedUrl);
    expect(screen.getByRole('dialog', { name: 'Tráiler: Película de prueba' })).toBeTruthy();
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTitle('Tráiler de Película de prueba')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('cierra desde el control visible y mantiene el foco dentro al navegar con teclado', () => {
    render(<TrailerModal video={trailer} title="Película de prueba" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver tráiler' }));

    const close = screen.getByRole('button', { name: 'Cerrar tráiler de Película de prueba' });
    const iframe = screen.getByTitle('Tráiler de Película de prueba');
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(iframe);
    fireEvent.keyDown(iframe, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    const outsideButton = document.createElement('button');
    document.body.append(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(close);
    outsideButton.remove();

    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ofrece un fallback accesible cuando no hay tráiler', () => {
    render(<TrailerModal video={null} title="Título sin vídeo" />);
    expect(screen.getByRole('status').textContent).toContain(
      'No hay tráiler disponible para este título.',
    );
    expect(screen.queryByRole('button', { name: 'Ver tráiler' })).toBeNull();
    expect(screen.queryByTitle('Tráiler de Título sin vídeo')).toBeNull();
  });
});
