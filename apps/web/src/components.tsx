import {
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export function GarquinsMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path d="M8 7.5h24v25H8z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 13h14v14H13z" fill="currentColor" opacity=".16" />
        <path d="m17 15 9 5-9 5V15Z" fill="currentColor" />
        <path d="M4 12v16M36 12v16" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

export function FormCard({
  onSubmit,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      {children}
    </form>
  );
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
};

export function Field({ label, name, value, onChange, helper, ...inputProps }: FieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <input
        className="field-input"
        id={name}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={helper ? `${name}-helper` : undefined}
        {...inputProps}
      />
      {helper && (
        <span className="field-helper" id={`${name}-helper`}>
          {helper}
        </span>
      )}
    </div>
  );
}

export function PasswordField({ label, name, value, onChange, helper, ...inputProps }: FieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <div className="password-control">
        <input
          className="field-input"
          id={name}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={helper ? `${name}-helper` : undefined}
          {...inputProps}
        />
        <button
          className="password-toggle"
          type="button"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setVisible((previous) => !previous)}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {helper && (
        <span className="field-helper" id={`${name}-helper`}>
          {helper}
        </span>
      )}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet';
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button button-${variant} ${className}`.trim()}
      type={type}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
    >
      {loading && <span className="button-spinner" aria-hidden="true" />}
      <span>{loading ? 'Un momento…' : children}</span>
    </button>
  );
}

export function Alert({
  children,
  variant,
}: {
  children: ReactNode;
  variant: 'error' | 'success';
}) {
  return (
    <div className={`alert alert-${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      <span className="alert-mark" aria-hidden="true">
        {variant === 'error' ? '!' : '✓'}
      </span>
      <p>{children}</p>
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
