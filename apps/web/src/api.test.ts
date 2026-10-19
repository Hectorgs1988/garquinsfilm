import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptInvitation,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  signIn,
  signOut,
} from './api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente HTTP de autenticación', () => {
  it('usa la sesión por cookie al iniciar sesión y recibe el usuario del servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        user: { id: 'user-1', name: 'Ada', email: 'ada@example.test', role: 'user' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(signIn('ada@example.test', 'password')).resolves.toMatchObject({
      id: 'user-1',
      email: 'ada@example.test',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/sign-in/email',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'ada@example.test', password: 'password' }),
      }),
    );
  });

  it('consulta y cierra la sesión usando los contratos de Better Auth/Fastify', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          user: { id: 'user-1', name: 'Ada', email: 'ada@example.test', role: 'user' },
        }),
      )
      .mockResolvedValueOnce(Response.json({ token: null }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCurrentUser()).resolves.toMatchObject({ id: 'user-1' });
    await expect(signOut()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/me', '/api/auth/sign-out']);
    expect(fetchMock.mock.calls.every(([, init]) => init.credentials === 'include')).toBe(true);
  });

  it('envía solo los campos documentados para invitación y recuperación', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ user: { id: 'created' } }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ status: true }))
      .mockResolvedValueOnce(Response.json({ status: true }));
    vi.stubGlobal('fetch', fetchMock);

    await acceptInvitation({
      email: 'invitee@example.test',
      name: 'Invitada',
      password: 'strong-password-123',
      token: 'invitation-token-value',
    });
    await requestPasswordReset('ada@example.test');
    await resetPassword('reset-token-value', 'strong-password-456');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/invitations/accept',
      '/api/auth/request-password-reset',
      '/api/auth/reset-password',
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      email: 'invitee@example.test',
      name: 'Invitada',
      password: 'strong-password-123',
      token: 'invitation-token-value',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({
      email: 'ada@example.test',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1].body))).toEqual({
      token: 'reset-token-value',
      newPassword: 'strong-password-456',
    });
  });

  it('devuelve null solo para 401 de sesión y no oculta errores de conectividad como sesión válida', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }))
      .mockRejectedValueOnce(new TypeError('network'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(getCurrentUser()).rejects.toThrow('No se pudo conectar con el servidor.');
  });
});
