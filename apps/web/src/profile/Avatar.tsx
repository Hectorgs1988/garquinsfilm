import { getInitials } from './profile.format.js';

const SIZES = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-12 w-12 text-base',
  lg: 'h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl',
} as const;

export function Avatar({
  name,
  email = '',
  size = 'md',
}: {
  name: string;
  email?: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-red-800/70 bg-gradient-to-br from-red-950 to-slate-900 font-bold tracking-wide text-red-100 ${SIZES[size]}`}
    >
      {getInitials(name, email)}
    </span>
  );
}
