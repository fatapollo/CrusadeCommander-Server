import { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

// Shared primitives — restyled to the Bunker Command visual direction.
// Square edges, Oswald display on actions, rust accent, mono labels.

export function Button({
  variant = 'primary', className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center gap-2 px-4 py-2 font-display font-bold text-[13px] tracking-[2px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-bunk-rust text-bunk-ink hover:bg-bunk-rustDeep',
    secondary: 'bg-bunk-surface text-bunk-bone border border-bunk-line hover:border-bunk-lineHi',
    ghost: 'text-bunk-boneDim hover:text-bunk-bone',
    danger: 'bg-bunk-oxblood text-bunk-bone hover:bg-bunk-red',
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...rest}>{children}</button>;
}

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`bg-bunk-surface border border-bunk-line ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  color = 'accent',
}: {
  children: ReactNode;
  color?: 'accent' | 'success' | 'danger' | 'warning' | 'dim';
}) {
  const colors = {
    accent: 'border-bunk-rust text-bunk-rust',
    success: 'border-bunk-green text-bunk-green',
    danger: 'border-bunk-red text-bunk-red',
    warning: 'border-bunk-warning text-bunk-warning',
    dim: 'border-bunk-boneDim text-bunk-boneDim',
  }[color];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 border ${colors} font-mono text-[10px] tracking-mono-md uppercase`}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] tracking-mono-md text-bunk-rust uppercase">{label}</span>
      {children}
      {hint && !error && <span className="font-mono text-[10px] text-bunk-boneDim">{hint}</span>}
      {error && <span className="font-mono text-[10px] text-bunk-red">{error}</span>}
    </label>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-bunk-bone leading-none">
          {title}
        </h1>
        {subtitle && (
          <p className="font-mono text-[11px] tracking-mono-sm text-bunk-boneDim mt-2 uppercase">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon = '◐',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16 border border-bunk-line bg-bunk-surface">
      <div className="text-5xl mb-3 text-bunk-rust">{icon}</div>
      <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bunk-bone">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-bunk-boneDim mt-2 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-bunk-rust border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export const PLAYER_COLORS = [
  '#C0392B', '#E74C3C', '#E67E22', '#F39C12',
  '#27AE60', '#2ECC71', '#2980B9', '#3498DB',
  '#8E44AD', '#9B59B6', '#16A085', '#1ABC9C',
  '#F1C40F', '#D35400', '#7F8C8D', '#BDC3C7',
];

export const FACTIONS = [
  'Space Marines', 'Blood Angels', 'Dark Angels', 'Space Wolves', 'Ultramarines',
  'Imperial Fists', 'Salamanders', 'Iron Hands', 'Raven Guard', 'White Scars',
  'Grey Knights', 'Deathwatch', 'Adeptus Custodes', 'Sisters of Battle',
  'Astra Militarum', 'Adeptus Mechanicus', 'Imperial Knights',
  'Chaos Space Marines', 'Death Guard', 'Thousand Sons', 'World Eaters',
  "Emperor's Children", 'Chaos Knights', 'Daemons of Chaos',
  'Necrons', 'Orks', "T'au Empire", 'Tyranids', 'Genestealer Cults',
  'Drukhari', 'Craftworld Aeldari', 'Harlequins', 'Leagues of Votann',
];

export const SUGGESTED_TEAMS = [
  'Imperium', 'Chaos', 'Xenos', 'Forces of Order', 'Forces of Disorder',
];

export function ColorPickerRow({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PLAYER_COLORS.map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          className={`w-7 h-7 border-2 transition-transform ${
            value === hex ? 'border-bunk-bone scale-110' : 'border-transparent hover:scale-105'
          }`}
          style={{ backgroundColor: hex }}
          aria-label={hex}
        />
      ))}
    </div>
  );
}
