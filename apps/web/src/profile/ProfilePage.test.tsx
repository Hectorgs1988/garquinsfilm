// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProfileView } from '@garquinsfilm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type SessionUser } from '../api.js';

const profileApi = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('./profile.api.js', () => profileApi);

import { ProfilePage } from './ProfilePage.js';

const user: SessionUser = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.test',
  role: 'user',
};
const profile: ProfileView = {
  name: 'Ada Lovelace',
  bio: 'Cine clásico y ciencia ficción.',
  avatar: { kind: 'initials' },
};

function renderPage(overrides: Partial<Parameters<typeof ProfilePage>[0]> = {}) {
  const onUnauthorized = vi.fn();
  const onProfileSaved = vi.fn();
  render(
    <ProfilePage
      user={user}
      onUnauthorized={onUnauthorized}
      onProfileSaved={onProfileSaved}
      {...overrides}
    />,
  );
  return { onUnauthorized, onProfileSaved };
}

async function openEditor() {
  fireEvent.click(await screen.findByRole('button', { name: 'Editar perfil' }));
  return screen.findByLabelText('Nombre visible');
}

beforeEach(() => {
  vi.clearAllMocks();
  profileApi.getProfile.mockResolvedValue(profile);
  profileApi.updateProfile.mockImplementation(
    async (input: { name?: string; bio?: string | null }) => ({
      ...profile,
      ...input,
    }),
  );
});

afterEach(cleanup);

describe('ProfilePage', () => {
  it('shows the profile and the account email', async () => {
    renderPage();
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.test')).toBeTruthy();
    expect(screen.getByText('Cine clásico y ciencia ficción.')).toBeTruthy();
  });

  it('shows an empty state when there is no bio', async () => {
    profileApi.getProfile.mockResolvedValue({ ...profile, bio: null });
    renderPage();
    expect(await screen.findByText('Todavía no has escrito nada sobre ti.')).toBeTruthy();
  });

  it('lets the user retry after a load failure', async () => {
    profileApi.getProfile.mockRejectedValueOnce(new ApiError(503, 'down'));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('El servicio no está disponible');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(profileApi.getProfile).toHaveBeenCalledTimes(2);
  });

  it('signals an expired session instead of showing an error', async () => {
    profileApi.getProfile.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));
    const { onUnauthorized } = renderPage();
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });

  it('sends only the fields that changed and reports the new name', async () => {
    const { onProfileSaved } = renderPage();
    const nameInput = await openEditor();

    fireEvent.change(nameInput, { target: { value: '  Ada L.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(profileApi.updateProfile).toHaveBeenCalledExactlyOnceWith({ name: 'Ada L.' }),
    );
    expect(onProfileSaved).toHaveBeenCalledWith('Ada L.');
    expect((await screen.findByRole('status')).textContent).toContain('Perfil actualizado.');
  });

  it('clears the bio by sending null', async () => {
    renderPage();
    await openEditor();

    fireEvent.change(screen.getByLabelText('Descripción breve (opcional)'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(profileApi.updateProfile).toHaveBeenCalledExactlyOnceWith({ bio: null }),
    );
  });

  it('does not call the API when nothing changed', async () => {
    renderPage();
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect((await screen.findByRole('status')).textContent).toContain(
      'No había cambios que guardar.',
    );
    expect(profileApi.updateProfile).not.toHaveBeenCalled();
  });

  it('rejects an empty name before reaching the API', async () => {
    renderPage();
    const nameInput = await openEditor();

    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'El nombre no puede estar vacío.',
    );
    expect(profileApi.updateProfile).not.toHaveBeenCalled();
  });

  it('rejects a bio over the limit before reaching the API', async () => {
    renderPage();
    await openEditor();

    fireEvent.change(screen.getByLabelText('Descripción breve (opcional)'), {
      target: { value: 'x'.repeat(301) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'La descripción no puede superar los 300 caracteres.',
    );
    expect(profileApi.updateProfile).not.toHaveBeenCalled();
  });

  it('counts bio characters by code point', async () => {
    renderPage();
    await openEditor();

    fireEvent.change(screen.getByLabelText('Descripción breve (opcional)'), {
      target: { value: '🎬🎬' },
    });
    expect(screen.getByText('2 de 300 caracteres')).toBeTruthy();
  });

  it('keeps the editor open and shows the reason when saving fails', async () => {
    profileApi.updateProfile.mockRejectedValueOnce(new ApiError(429, 'too many'));
    renderPage();
    const nameInput = await openEditor();

    fireEvent.change(nameInput, { target: { value: 'Otro nombre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Has hecho demasiados cambios seguidos. Espera un minuto.',
    );
    expect(screen.getByLabelText('Nombre visible')).toBeTruthy();
  });

  it('restores the saved values when editing is cancelled', async () => {
    renderPage();
    const nameInput = await openEditor();

    fireEvent.change(nameInput, { target: { value: 'Borrador' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(profileApi.updateProfile).not.toHaveBeenCalled();
  });
});
