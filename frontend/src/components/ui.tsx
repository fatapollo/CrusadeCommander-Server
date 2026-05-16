import { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary', className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const base = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'bg-bg-elevated text-ink hover:bg-white/5 border border-white/10',
    ghost: 'text-ink-dim hover:text-ink hover:bg-white/5',
    danger: 'bg-danger text-white hover:bg-red-700',
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...rest}>{children}</button>;
}

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`bg-bg-card border border-white/5 rounded-xl ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Badge({ children, color = 'accent' }: { children: ReactNode; color?: 'accent' | 'success' | 'danger' | 'warning' | 'dim' }) {
  const colors = {
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success/15 text-success',
    danger: 'bg-danger/15 text-danger',
    warning: 'bg-warning/15 text-warning',
    dim: 'bg-white/5 text-ink-dim',
  }[color];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors}`}>{children}</span>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-dim">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-ink-fade">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-ink-dim text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon = '·', title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-3 text-ink-fade">{icon}</div>
      <h3 className="text-lg font-semibold text-ink-dim">{title}</h3>
      {description && <p className="text-sm text-ink-fade mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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
      {PLAYER_COLORS.map(hex => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          className={`w-7 h-7 rounded-full border-2 transition-transform ${value === hex ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
          style={{ backgroundColor: hex }}
          aria-label={hex}
        />
      ))}
    </div>
  );
}
