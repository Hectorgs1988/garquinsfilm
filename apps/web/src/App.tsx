import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import {
  acceptInvitation,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  signIn,
  signOut,
  type SessionUser,
} from './api.js';
import {
  Alert,
  Button,
  Field,
  FormCard,
  GarquinsMark,
  Loading,
  PasswordField,
} from './components.js';

type Route = '/login' | '/accept-invitation' | '/forgot-password' | '/reset-password' | '/app';

const PASSWORD_RESET_CONFIRMATION =
  'Si existe una cuenta con ese correo, recibirás las instrucciones para recuperar el acceso.';

function getRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/login') return '/login';
  if (
    path === '/accept-invitation' ||
    path === '/forgot-password' ||
    path === '/reset-password' ||
    path === '/app'
  ) {
    return path;
  }
  return '/login';
}

function navigate(path: Route, replace = false): void {
  if (replace) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App({ initialAuthHash = '' }: { initialAuthHash?: string }) {
  const [route, setRoute] = useState<Route>(getRoute);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    const handlePopState = () => setRoute(getRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const refreshSession = () => {
      if (document.visibilityState !== 'visible') return;
      getCurrentUser()
        .then((currentUser) => {
          setUser(currentUser);
          setSessionError('');
        })
        .catch(() => {
          setSessionError(
            'No se pudo comprobar la sesión. Comprueba la conexión e inténtalo de nuevo.',
          );
        });
    };
    window.addEventListener('focus', refreshSession);
    return () => window.removeEventListener('focus', refreshSession);
  }, []);

  useEffect(() => {
    let active = true;
    setSessionLoading(true);
    setSessionError('');
    getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setSessionError(
            'No se pudo comprobar la sesión. Comprueba la conexión e inténtalo de nuevo.',
          );
        }
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route]);

  useEffect(() => {
    if (sessionLoading) return;
    if (route === '/app' && !user) navigate('/login', true);
    if (
      user &&
      (route === '/login' || route === '/forgot-password' || route === '/accept-invitation')
    ) {
      navigate('/app', true);
    }
  }, [route, sessionLoading, user]);

  if (sessionLoading) {
    return (
      <main className="app-shell">
        <Loading label="Comprobando tu sesión" />
      </main>
    );
  }

  if (route === '/app') {
    if (!user) {
      return (
        <main className="app-shell">
          <Loading label="Redirigiendo al inicio de sesión" />
        </main>
      );
    }
    return (
      <PrivateHome
        user={user}
        error={sessionError}
        onLogout={async () => {
          try {
            await signOut();
            setUser(null);
            navigate('/login', true);
          } catch {
            setSessionError('No se pudo cerrar la sesión. Inténtalo de nuevo.');
          }
        }}
      />
    );
  }

  if (route === '/accept-invitation') return <InvitationPage initialAuthHash={initialAuthHash} />;
  if (route === '/forgot-password') return <ForgotPasswordPage />;
  if (route === '/reset-password') return <ResetPasswordPage initialAuthHash={initialAuthHash} />;

  return (
    <LoginPage
      error={sessionError}
      onSignedIn={(signedInUser) => {
        setUser(signedInUser);
        navigate('/app', true);
      }}
    />
  );
}

function AuthLayout({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-backdrop" aria-hidden="true">
        <div className="backdrop-orbit backdrop-orbit-one" />
        <div className="backdrop-orbit backdrop-orbit-two" />
      </div>
      <div className="auth-layout">
        <header className="brand-lockup">
          <GarquinsMark />
          <span>GarquinsFilm</span>
        </header>
        <section className="auth-content" aria-labelledby="auth-title">
          <div className="auth-intro">
            <span className="eyebrow">{eyebrow}</span>
            <h1 id="auth-title">{title}</h1>
            <p>{description}</p>
          </div>
          <div className="auth-card">{children}</div>
          <p className="auth-footnote">Un espacio privado para las historias que te acompañan.</p>
        </section>
      </div>
    </main>
  );
}

function LoginPage({
  error: initialError,
  onSignedIn,
}: {
  error: string;
  onSignedIn: (user: SessionUser) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await signIn(email.trim(), password);
      onSignedIn(user);
    } catch {
      setError('No se pudo iniciar sesión. Comprueba tus datos e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Tu cine, a tu manera"
      title="Qué bueno tenerte de vuelta."
      description="Inicia sesión para continuar en tu espacio personal."
    >
      <FormCard onSubmit={handleSubmit}>
        {error && <Alert variant="error">{error}</Alert>}
        <Field
          label="Correo electrónico"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          required
          autoCapitalize="none"
          inputMode="email"
          placeholder="tu@correo.com"
        />
        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
        />
        <div className="form-utility">
          <a className="text-link" href="/forgot-password" onClick={handleLink('/forgot-password')}>
            ¿Has olvidado tu contraseña?
          </a>
        </div>
        <Button type="submit" loading={loading} className="button-wide">
          Iniciar sesión
        </Button>
        <p className="form-note">Para entrar, necesitas una invitación.</p>
      </FormCard>
    </AuthLayout>
  );
}

function InvitationPage({ initialAuthHash }: { initialAuthHash: string }) {
  const [fragment] = useState(() => new URLSearchParams(initialAuthHash.slice(1)));
  const token = fragment.get('token') ?? '';
  const fragmentEmail = fragment.get('email') ?? '';
  // Los enlaces emitidos por CLI local solo incluyen el token; el correo se pide en el formulario.
  const [typedEmail, setTypedEmail] = useState('');
  const email = fragmentEmail || typedEmail.trim();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!token || !email) {
      setError(
        'Este enlace de invitación ya no está disponible. Pide una nueva para crear tu cuenta.',
      );
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await acceptInvitation({ email, name: name.trim(), password, token });
      setSuccess(true);
    } catch {
      setError(
        'Este enlace de invitación ya no está disponible. Pide una nueva para crear tu cuenta.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Acceso por invitación"
      title="Tu espacio está a un paso."
      description="Crea tu cuenta para entrar en GarquinsFilm."
    >
      {success ? (
        <div className="stack-md">
          <Alert variant="success">Tu cuenta está lista. Ya puedes iniciar sesión.</Alert>
          <Button className="button-wide" onClick={() => navigate('/login', true)}>
            Ir a iniciar sesión
          </Button>
        </div>
      ) : !token ? (
        <div className="stack-md">
          <Alert variant="error">
            Este enlace de invitación ya no está disponible. Pide una nueva para crear tu cuenta.
          </Alert>
          <Button variant="secondary" className="button-wide" onClick={() => navigate('/login')}>
            Volver al inicio
          </Button>
        </div>
      ) : (
        <FormCard onSubmit={handleSubmit}>
          {error && <Alert variant="error">{error}</Alert>}
          {!fragmentEmail && (
            <Field
              label="Correo electrónico"
              name="email"
              type="email"
              autoComplete="email"
              value={typedEmail}
              onChange={setTypedEmail}
              required
              autoCapitalize="none"
              inputMode="email"
              placeholder="tu@correo.com"
              helper="Usa el correo al que se envió la invitación."
            />
          )}
          <Field
            label="Nombre"
            name="name"
            autoComplete="name"
            value={name}
            onChange={setName}
            required
            maxLength={128}
            placeholder="Cómo te llamamos"
          />
          <PasswordField
            label="Contraseña"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            required
            minLength={12}
            maxLength={128}
            helper="Usa al menos 12 caracteres."
          />
          <PasswordField
            label="Confirmar contraseña"
            name="confirm-password"
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
            required
            minLength={12}
            maxLength={128}
          />
          <Button type="submit" loading={loading} className="button-wide">
            Crear mi cuenta
          </Button>
          <p className="form-note">Esta invitación solo se puede usar una vez.</p>
        </FormCard>
      )}
    </AuthLayout>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
    } catch {
      setError('No se pudo procesar la solicitud ahora. Inténtalo de nuevo más tarde.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Recuperación segura"
      title="Volvamos a darte acceso."
      description="Te ayudaremos a recuperar tu cuenta de forma segura."
    >
      {submitted ? (
        <div className="stack-md">
          <Alert variant="success">{PASSWORD_RESET_CONFIRMATION}</Alert>
          <Button variant="secondary" className="button-wide" onClick={() => navigate('/login')}>
            Volver al inicio de sesión
          </Button>
        </div>
      ) : (
        <FormCard onSubmit={handleSubmit}>
          {error && <Alert variant="error">{error}</Alert>}
          <Field
            label="Correo electrónico"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            required
            autoCapitalize="none"
            inputMode="email"
            placeholder="tu@correo.com"
          />
          <Button type="submit" loading={loading} className="button-wide">
            Enviarme instrucciones
          </Button>
          <p className="form-note">{PASSWORD_RESET_CONFIRMATION}</p>
          <a className="back-link" href="/login" onClick={handleLink('/login')}>
            <span aria-hidden="true">←</span> Volver al inicio de sesión
          </a>
        </FormCard>
      )}
    </AuthLayout>
  );
}

function ResetPasswordPage({ initialAuthHash }: { initialAuthHash: string }) {
  const [fragment] = useState(() => new URLSearchParams(initialAuthHash.slice(1)));
  const token = fragment.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('Este enlace ya no está disponible. Solicita otro para recuperar el acceso.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch {
      setError('Este enlace ya no está disponible. Solicita otro para recuperar el acceso.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Último paso"
      title="Elige una contraseña nueva."
      description="Usa una contraseña segura que no compartas con nadie."
    >
      {success ? (
        <div className="stack-md">
          <Alert variant="success">
            Tu contraseña se ha actualizado. Las sesiones anteriores se han cerrado.
          </Alert>
          <Button className="button-wide" onClick={() => navigate('/login', true)}>
            Volver al inicio de sesión
          </Button>
        </div>
      ) : !token ? (
        <div className="stack-md">
          <Alert variant="error">
            Este enlace ya no está disponible. Solicita otro para recuperar el acceso.
          </Alert>
          <Button
            variant="secondary"
            className="button-wide"
            onClick={() => navigate('/forgot-password')}
          >
            Solicitar otro enlace
          </Button>
        </div>
      ) : (
        <FormCard onSubmit={handleSubmit}>
          {error && <Alert variant="error">{error}</Alert>}
          <PasswordField
            label="Nueva contraseña"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            required
            minLength={12}
            maxLength={128}
            helper="Usa al menos 12 caracteres."
          />
          <PasswordField
            label="Confirmar contraseña"
            name="confirm-password"
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
            required
            minLength={12}
            maxLength={128}
          />
          <Button type="submit" loading={loading} className="button-wide">
            Guardar contraseña nueva
          </Button>
        </FormCard>
      )}
    </AuthLayout>
  );
}

const privateSections = [
  { label: 'Inicio', icon: '⌂', current: true },
  { label: 'Biblioteca', icon: '▤', current: false },
  { label: 'Listas', icon: '▧', current: false },
  { label: 'Rankings', icon: '↗', current: false },
];

function PrivateHome({
  user,
  error,
  onLogout,
}: {
  user: SessionUser;
  error: string;
  onLogout: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  async function handleLogout() {
    setLoading(true);
    await onLogout();
    setLoading(false);
  }

  return (
    <main className="private-shell">
      <header className="private-header">
        <a className="brand-lockup" href="/app" aria-label="GarquinsFilm, inicio">
          <GarquinsMark />
          <span>GarquinsFilm</span>
        </a>
        <div className="header-actions">
          <span className="user-chip">{user.name || user.email}</span>
          <Button variant="quiet" loading={loading} onClick={() => void handleLogout()}>
            Cerrar sesión
          </Button>
        </div>
      </header>
      <div className="private-layout">
        <aside className="desktop-navigation" aria-label="Navegación principal">
          <NavigationList />
          <div className="sidebar-note">Tu espacio, siempre a tu manera.</div>
        </aside>
        <section className="private-content" aria-labelledby="welcome-title">
          <div className="welcome-panel">
            <div className="welcome-copy">
              <span className="eyebrow">TU ESPACIO PERSONAL</span>
              <h1 id="welcome-title">Hola, {user.name || user.email.split('@')[0]}.</h1>
              <p>Un buen lugar para empezar a organizar tus próximas historias.</p>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <div className="art-screen">
                <span />
                <span />
                <span />
              </div>
              <div className="art-glow" />
            </div>
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="section-heading">
            <div>
              <span className="eyebrow">PRÓXIMAMENTE</span>
              <h2>Tu próxima gran historia</h2>
            </div>
          </div>
          <div className="feature-grid">
            <FeatureCard
              icon="▤"
              title="Mi biblioteca"
              description="Tus películas y series, en un solo lugar."
            />
            <FeatureCard
              icon="▧"
              title="Mis listas"
              description="Colecciones para compartir y descubrir."
            />
            <FeatureCard icon="↗" title="Rankings" description="Selecciones creadas a tu medida." />
            <FeatureCard
              icon="✦"
              title="Recomendaciones"
              description="Nuevas historias por explorar."
            />
          </div>
        </section>
      </div>
      <nav className="mobile-navigation" aria-label="Navegación principal">
        <NavigationList />
      </nav>
    </main>
  );
}

function NavigationList() {
  return (
    <ul className="navigation-list">
      {privateSections.map((section) => (
        <li key={section.label}>
          {section.current ? (
            <a
              className="navigation-item is-current"
              href="/app"
              aria-current="page"
              aria-label={section.label}
            >
              <span className="navigation-icon" aria-hidden="true">
                {section.icon}
              </span>
              <span>{section.label}</span>
            </a>
          ) : (
            <span
              className="navigation-item navigation-item-disabled"
              aria-disabled="true"
              aria-label={`${section.label}, próximamente`}
            >
              <span className="navigation-icon" aria-hidden="true">
                {section.icon}
              </span>
              <span>{section.label}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <article className="feature-card">
      <span className="feature-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <span className="coming-soon">Próximamente</span>
    </article>
  );
}

function handleLink(route: Route) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(route);
  };
}
