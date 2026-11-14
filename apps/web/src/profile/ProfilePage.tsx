import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
  type ProfileUpdateInput,
  type ProfileView,
} from '@garquinsfilm/shared';

import { ApiError, type SessionUser } from '../api.js';
import { Avatar } from './Avatar.js';
import { getProfile, updateProfile } from './profile.api.js';
import { normalizeBioInput, normalizeNameInput, textLength } from './profile.format.js';

function getErrorMessage(error: unknown, action: 'load' | 'save'): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    if (error.status === 400) return 'Revisa los datos: el nombre o la descripción no son válidos.';
    if (error.status === 404) return 'Tu cuenta ya no está disponible.';
    if (error.status === 429) return 'Has hecho demasiados cambios seguidos. Espera un minuto.';
    if (error.status === 503)
      return 'El servicio no está disponible ahora. Inténtalo de nuevo más tarde.';
    if (error.status === 0) return 'No se pudo conectar con el servidor. Comprueba tu conexión.';
  }
  return action === 'load'
    ? 'No se pudo cargar tu perfil. Inténtalo de nuevo.'
    : 'No se pudieron guardar los cambios. Inténtalo de nuevo.';
}

export function ProfilePage({
  user,
  onUnauthorized,
  onProfileSaved,
}: {
  user: SessionUser;
  onUnauthorized: () => void;
  onProfileSaved: (name: string) => void;
}) {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError('');

    getProfile(controller.signal)
      .then((loaded) => {
        if (!active) return;
        setProfile(loaded);
        setName(loaded.name);
        setBio(loaded.bio ?? '');
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized();
          return;
        }
        setLoadError(getErrorMessage(error, 'load'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey, onUnauthorized]);

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setFormError('');
    setNotice('');
    setName(profile?.name ?? '');
    setBio(profile?.bio ?? '');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setFormError('');
    setName(profile?.name ?? '');
    setBio(profile?.bio ?? '');
    headingRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    const nextName = normalizeNameInput(name);
    const nextBio = normalizeBioInput(bio);

    if (nextName.length === 0) {
      setFormError('El nombre no puede estar vacío.');
      nameRef.current?.focus();
      return;
    }
    if (textLength(nextName) > PROFILE_NAME_MAX_LENGTH) {
      setFormError(`El nombre no puede superar los ${PROFILE_NAME_MAX_LENGTH} caracteres.`);
      nameRef.current?.focus();
      return;
    }
    if (nextBio !== null && textLength(nextBio) > PROFILE_BIO_MAX_LENGTH) {
      setFormError(`La descripción no puede superar los ${PROFILE_BIO_MAX_LENGTH} caracteres.`);
      return;
    }

    const input: ProfileUpdateInput = {};
    if (nextName !== profile.name) input.name = nextName;
    if (nextBio !== profile.bio) input.bio = nextBio;

    if (Object.keys(input).length === 0) {
      setEditing(false);
      setFormError('');
      setNotice('No había cambios que guardar.');
      headingRef.current?.focus();
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const saved = await updateProfile(input);
      setProfile(saved);
      setName(saved.name);
      setBio(saved.bio ?? '');
      setEditing(false);
      setNotice('Perfil actualizado.');
      onProfileSaved(saved.name);
      headingRef.current?.focus();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      setFormError(getErrorMessage(error, 'save'));
    } finally {
      setSaving(false);
    }
  }

  const nameLength = textLength(normalizeNameInput(name));
  const bioLength = textLength(bio.trim());
  const bioOverLimit = bioLength > PROFILE_BIO_MAX_LENGTH;

  return (
    <section aria-labelledby="profile-title" className="space-y-6 sm:space-y-8">
      <header className="space-y-2">
        <span className="text-xs font-bold tracking-[0.16em] text-red-300 uppercase">
          Tu espacio personal
        </span>
        <h1
          ref={headingRef}
          id="profile-title"
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl"
        >
          Mi perfil
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Así te verás en GarquinsFilm. Tu correo no se muestra a otras personas.
        </p>
      </header>

      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm text-emerald-200"
        >
          {notice}
        </p>
      )}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-12 text-center text-slate-300"
        >
          <span className="inline-block animate-pulse motion-reduce:animate-none">
            Cargando tu perfil…
          </span>
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-12 text-center">
          <p role="alert" className="text-sm text-red-200">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            className="mt-4 min-h-11 cursor-pointer rounded-lg bg-red-800 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
          >
            Reintentar
          </button>
        </div>
      ) : profile ? (
        <div className="space-y-5 rounded-2xl border border-slate-700 bg-slate-800/60 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <Avatar name={profile.name} email={user.email} size="lg" />
            <div className="min-w-0 space-y-1">
              <p className="truncate text-xl font-semibold text-slate-50 sm:text-2xl">
                {profile.name}
              </p>
              <p className="truncate text-sm text-slate-400">{user.email}</p>
              <p className="text-xs text-slate-500">
                {user.role === 'admin' ? 'Administrador' : 'Usuario'}
              </p>
            </div>
          </div>

          {editing ? (
            <form onSubmit={handleSubmit} className="space-y-4 border-t border-slate-700 pt-5">
              {formError && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-200"
                >
                  {formError}
                </p>
              )}

              <div className="grid gap-1.5">
                <label htmlFor="profile-name" className="text-xs font-medium text-slate-300">
                  Nombre visible
                </label>
                <input
                  ref={nameRef}
                  id="profile-name"
                  name="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={PROFILE_NAME_MAX_LENGTH}
                  required
                  autoComplete="name"
                  aria-describedby="profile-name-counter"
                  className="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                />
                <span id="profile-name-counter" className="text-xs text-slate-400">
                  {nameLength} de {PROFILE_NAME_MAX_LENGTH} caracteres
                </span>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="profile-bio" className="text-xs font-medium text-slate-300">
                  Descripción breve (opcional)
                </label>
                <textarea
                  id="profile-bio"
                  name="profile-bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={4}
                  aria-describedby="profile-bio-counter"
                  aria-invalid={bioOverLimit || undefined}
                  placeholder="Qué sueles ver, tus géneros favoritos…"
                  className="rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm leading-relaxed text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                />
                <span
                  id="profile-bio-counter"
                  aria-live="polite"
                  className={`text-xs ${bioOverLimit ? 'text-red-300' : 'text-slate-400'}`}
                >
                  {bioLength} de {PROFILE_BIO_MAX_LENGTH} caracteres
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  aria-busy={saving || undefined}
                  className="min-h-11 cursor-pointer rounded-lg bg-red-800 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-default disabled:opacity-60"
                >
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="min-h-11 cursor-pointer rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-200 hover:border-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-default disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 border-t border-slate-700 pt-5">
              <div className="space-y-1.5">
                <h2 className="text-xs font-medium text-slate-400">Descripción</h2>
                {profile.bio ? (
                  <p className="max-w-2xl text-sm leading-relaxed whitespace-pre-line text-slate-200">
                    {profile.bio}
                  </p>
                ) : (
                  <p className="text-sm text-slate-400">Todavía no has escrito nada sobre ti.</p>
                )}
              </div>
              <button
                type="button"
                onClick={startEditing}
                className="min-h-11 cursor-pointer rounded-lg bg-red-800 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
              >
                Editar perfil
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
