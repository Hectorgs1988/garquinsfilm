export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

export interface InvitationAcceptance {
  email: string;
  name: string;
  password: string;
  token: string;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = isApiErrorBody(body) ? body : {};
    throw new ApiError(
      response.status,
      errorBody.error ?? errorBody.message ?? 'La solicitud no se pudo completar.',
    );
  }
  return body as T;
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const result = await request<{ user?: SessionUser }>('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!result.user) throw new ApiError(502, 'La respuesta de sesión no es válida.');
  return result.user;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const result = await request<{ user: SessionUser }>('/api/me');
    return result.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function signOut(): Promise<void> {
  await request('/api/auth/sign-out', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function acceptInvitation(input: InvitationAcceptance): Promise<unknown> {
  return request('/api/invitations/accept', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await request('/api/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null;
}
