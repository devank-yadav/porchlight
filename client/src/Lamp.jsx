// The porch light: the one bold element in the design.
// lit = checked in today, dim = waiting, alert = missed / help / scam.
export function lampState(senior) {
  if (!senior) return 'dim';
  if (['missed', 'help'].includes(senior.status)) return 'alert';
  if (['ok', 'talking', 'scam', 'needs-human'].includes(senior.status)) return 'lit';
  return 'dim';
}

export default function Lamp({ state = 'dim', size = 120, label }) {
  return (
    <div className={`lamp lamp-${state}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id={`glow-${state}`} cx="50%" cy="58%" r="50%">
            <stop offset="0%" stopColor="var(--lamp-core)" stopOpacity="1" />
            <stop offset="45%" stopColor="var(--lamp-core)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--lamp-core)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="lamp-halo" cx="60" cy="68" r="56" fill={`url(#glow-${state})`} />
        {/* bracket */}
        <path d="M60 10 V28" stroke="var(--lamp-metal)" strokeWidth="5" strokeLinecap="round" />
        <path d="M40 30 H80 L74 40 H46 Z" fill="var(--lamp-metal)" />
        {/* glass */}
        <path d="M46 40 H74 L70 84 Q60 90 50 84 Z" fill="var(--lamp-glass)" stroke="var(--lamp-metal)" strokeWidth="3" />
        <path d="M52 52 Q60 47 68 52 L66 78 Q60 82 54 78 Z" fill="var(--lamp-flame)" className="lamp-bulb" />
        <path d="M48 86 H72" stroke="var(--lamp-metal)" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
