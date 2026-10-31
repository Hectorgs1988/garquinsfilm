// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { SessionUser } from './api.js';

const api = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  getCurrentUser: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./api.js', () => api);

const testUser: SessionUser = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.test',
  role: 'user',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getCurrentUser.mockResolvedValue(null);
  api.signIn.mockResolvedValue(testUser);
  api.signOut.mockResolvedValue(undefined);
  api.acceptInvitation.mockResolvedValue({ id: 'new-user' });
  api.requestPasswordReset.mockResolvedValue(undefined);
  api.resetPassword.mockResolvedValue(undefined);
  window.history.replaceState(null, '', '/login');
});

afterEach(() => cleanup());

describe('flujo de autenticación y navegación privada', () => {
  it('inicia sesión mediante la API y abre el área privada', async () => {
    api.getCurrentUser.mockResolvedValueOnce(null).mockResolvedValue(testUser);
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Correo electrónico'), {
      target: { value: 'ada@example.test' },
    });
    fireEvent.change(await screen.findByLabelText('Contraseña'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Ada.' })).toBeTruthy();
    expect(api.signIn).toHaveBeenCalledWith('ada@example.test', 'correct-password');
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeTruthy();
    expect(screen.getByText('Mi biblioteca')).toBeTruthy();
    expect(screen.getAllByText('Próximamente')).toHaveLength(4);
  });

  it('muestra error genérico ante credenciales rechazadas', async () => {
    api.signIn.mockRejectedValue(new Error('invalid credentials'));
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Correo electrónico'), {
      target: { value: 'ada@example.test' },
    });
    fireEvent.change(await screen.findByLabelText('Contraseña'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No se pudo iniciar sesión. Comprueba tus datos e inténtalo de nuevo.',
    );
    expect(screen.queryByText('invalid credentials')).toBeNull();
  });

  it('usa validación nativa en los campos obligatorios', async () => {
    render(<App />);
    const email = (await screen.findByLabelText('Correo electrónico')) as HTMLInputElement;
    expect(email.required).toBe(true);
    expect(email.type).toBe('email');
    expect(email.checkValidity()).toBe(false);
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it('envía solicitud de recuperación y presenta siempre una confirmación genérica', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('link', { name: '¿Has olvidado tu contraseña?' }));
    const confirmation =
      'Si existe una cuenta con ese correo, recibirás las instrucciones para recuperar el acceso.';
    expect(await screen.findByText(confirmation)).toBeTruthy();
    expect(
      screen.queryByText(
        'La confirmación será la misma tanto si encontramos una cuenta como si no.',
      ),
    ).toBeNull();
    fireEvent.change(await screen.findByLabelText('Correo electrónico'), {
      target: { value: 'unknown@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviarme instrucciones' }));

    expect((await screen.findByRole('status')).textContent).toContain(confirmation);
    expect(screen.getAllByText(confirmation)).toHaveLength(1);
    expect(api.requestPasswordReset).toHaveBeenCalledWith('unknown@example.test');
    expect(screen.queryByText('unknown@example.test')).toBeNull();
  });

  it('acepta una invitación válida sin volver a mostrar su token/email en la URL o en la página', async () => {
    window.history.replaceState(null, '', '/accept-invitation');
    render(<App initialAuthHash="#token=one-time-invitation-token&email=invitee%40example.test" />);

    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Nueva persona' },
    });
    fireEvent.change(await screen.findByLabelText('Contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.change(await screen.findByLabelText('Confirmar contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    expect((await screen.findByRole('status')).textContent).toContain('Tu cuenta está lista');
    expect(api.acceptInvitation).toHaveBeenCalledWith({
      email: 'invitee@example.test',
      name: 'Nueva persona',
      password: 'a-secure-password-123',
      token: 'one-time-invitation-token',
    });
    expect(window.location.href).not.toContain('one-time-invitation-token');
    expect(screen.queryByText('invitee@example.test')).toBeNull();
  });

  it('rechaza invitaciones inválidas sin enviar datos y representa vencidas/revocadas como no disponibles', async () => {
    window.history.replaceState(null, '', '/accept-invitation');
    render(<App initialAuthHash="#token=expired-or-revoked&email=invitee%40example.test" />);
    api.acceptInvitation.mockRejectedValue(
      new Error('Invitation is invalid or no longer available.'),
    );

    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Persona' } });
    fireEvent.change(await screen.findByLabelText('Contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.change(await screen.findByLabelText('Confirmar contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Este enlace de invitación ya no está disponible.',
    );
  });

  it('acepta enlaces con solo token (CLI local) pidiendo el correo y enviando el token íntegro', async () => {
    const token = 'local-cli-token-0123456789abcdefghijklmnopqrstuv_-';
    window.history.replaceState(null, '', '/accept-invitation');
    render(<App initialAuthHash={`#token=${token}`} />);

    fireEvent.change(await screen.findByLabelText('Correo electrónico'), {
      target: { value: '  Invitee@Example.test ' },
    });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Persona' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    expect((await screen.findByRole('status')).textContent).toContain('Tu cuenta está lista');
    expect(api.acceptInvitation).toHaveBeenCalledWith({
      email: 'Invitee@Example.test',
      name: 'Persona',
      password: 'a-secure-password-123',
      token,
    });
    expect(window.location.href).not.toContain(token);
  });

  it('no pide el correo cuando el enlace ya lo incluye en el fragmento', async () => {
    window.history.replaceState(null, '', '/accept-invitation');
    render(<App initialAuthHash="#token=valid-token&email=invitee%40example.test" />);

    expect(await screen.findByLabelText('Nombre')).toBeTruthy();
    expect(screen.queryByLabelText('Correo electrónico')).toBeNull();
  });

  it('no permite crear una cuenta cuando falta el fragmento de invitación', async () => {
    window.history.replaceState(null, '', '/accept-invitation');
    render(<App initialAuthHash="" />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Este enlace de invitación ya no está disponible.',
    );
    expect(screen.queryByRole('button', { name: 'Crear mi cuenta' })).toBeNull();
    expect(api.acceptInvitation).not.toHaveBeenCalled();
  });

  it('no envía contraseñas de invitación que no coinciden', async () => {
    window.history.replaceState(null, '', '/accept-invitation');
    render(<App initialAuthHash="#token=valid-token&email=invitee%40example.test" />);

    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Persona' } });
    fireEvent.change(await screen.findByLabelText('Contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.change(await screen.findByLabelText('Confirmar contraseña'), {
      target: { value: 'a-different-password-456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Las contraseñas no coinciden.',
    );
    expect(api.acceptInvitation).not.toHaveBeenCalled();
  });

  it('restablece la contraseña con el token temporal y gestiona token inválido', async () => {
    window.history.replaceState(null, '', '/reset-password');
    render(<App initialAuthHash="#token=one-time-reset-token" />);

    fireEvent.change(await screen.findByLabelText('Nueva contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.change(await screen.findByLabelText('Confirmar contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña nueva' }));

    expect((await screen.findByRole('status')).textContent).toContain(
      'Tu contraseña se ha actualizado',
    );
    expect(api.resetPassword).toHaveBeenCalledWith('one-time-reset-token', 'a-secure-password-123');
  });

  it('presenta como caducado o inválido un enlace de restablecimiento ausente', async () => {
    window.history.replaceState(null, '', '/reset-password');
    render(<App initialAuthHash="" />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Este enlace ya no está disponible.',
    );
  });

  it('rechaza un token de recuperación caducado o ya consumido', async () => {
    api.resetPassword.mockRejectedValue(new Error('invalid or expired token'));
    window.history.replaceState(null, '', '/reset-password');
    render(<App initialAuthHash="#token=expired-or-consumed-token" />);
    fireEvent.change(await screen.findByLabelText('Nueva contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.change(await screen.findByLabelText('Confirmar contraseña'), {
      target: { value: 'a-secure-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña nueva' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Este enlace ya no está disponible.',
    );
  });

  it('redirige a login si la comprobación de sesión no autoriza la ruta privada', async () => {
    window.history.replaceState(null, '', '/app');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Qué bueno tenerte de vuelta.' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Tu espacio personal' })).toBeNull();
  });

  it('protege /app/explore y permite el catálogo únicamente con una sesión válida', async () => {
    window.history.replaceState(null, '', '/app/explore');
    const { unmount } = render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Qué bueno tenerte de vuelta.' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Descubre tu próxima historia.' })).toBeNull();

    unmount();
    api.getCurrentUser.mockResolvedValue(testUser);
    window.history.replaceState(null, '', '/app/explore');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Descubre tu próxima historia.' }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: 'Explorar' })
        .every((link) => link.getAttribute('aria-current') === 'page'),
    ).toBe(true);
  });

  it('cierra la sesión real y vuelve al login', async () => {
    api.getCurrentUser.mockResolvedValue(testUser);
    window.history.replaceState(null, '', '/app');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(
      await screen.findByRole('heading', { name: 'Qué bueno tenerte de vuelta.' }),
    ).toBeTruthy();
    expect(api.signOut).toHaveBeenCalledOnce();
  });

  it('sincroniza la sesión con el servidor al volver a enfocar la aplicación', async () => {
    api.getCurrentUser.mockResolvedValueOnce(testUser).mockResolvedValueOnce(null);
    window.history.replaceState(null, '', '/app');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Hola, Ada.' })).toBeTruthy();
    fireEvent(window, new Event('focus'));

    expect(
      await screen.findByRole('heading', { name: 'Qué bueno tenerte de vuelta.' }),
    ).toBeTruthy();
  });

  it('muestra de forma segura errores de conectividad en la comprobación de sesión', async () => {
    api.getCurrentUser.mockRejectedValue(new Error('network failure'));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'No se pudo comprobar la sesión. Comprueba la conexión e inténtalo de nuevo.',
      );
    });
    expect(screen.queryByText('network failure')).toBeNull();
  });
});
