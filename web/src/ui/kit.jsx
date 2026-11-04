import { motion, AnimatePresence } from 'framer-motion';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Card({ className, children, ...p }) {
  return <div className={cx('rounded-3xl border border-white/[.06] bg-night-850/80 p-4 shadow-card', className)} {...p}>{children}</div>;
}

export function Label({ children, className }) {
  return <div className={cx('text-[11px] font-bold uppercase tracking-[.14em] text-ink-mute', className)}>{children}</div>;
}

const BTN = {
  primary: 'bg-ball text-ball-ink shadow-glow hover:bg-ball-soft',
  secondary: 'bg-night-700 text-ink border border-white/[.07] hover:bg-night-600',
  ghost: 'bg-transparent text-ink-soft border border-white/10 hover:bg-white/5',
  teal: 'bg-teal text-[#032a22]',
  danger: 'bg-rose text-white',
};
export function Button({ variant = 'primary', size = 'md', className, children, disabled, ...p }) {
  const sz = size === 'lg' ? 'h-14 px-5 text-[17px]' : size === 'sm' ? 'h-9 px-3 text-sm rounded-xl' : 'h-12 px-4 text-[15px]';
  return (
    <motion.button whileTap={disabled ? undefined : { scale: 0.97 }} disabled={disabled}
      className={cx('inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition-colors', sz,
        disabled ? (variant === 'primary' || variant === 'teal' ? 'cursor-default border border-white/10 bg-night-700 text-ink-soft' : cx(BTN[variant], 'opacity-40')) : BTN[variant], className)} {...p}>
      {children}
    </motion.button>
  );
}

export function Seg({ options, value, onChange, className }) {
  return (
    <div className={cx('relative flex rounded-2xl bg-night-950/60 p-1 border border-white/[.06]', className)}>
      {options.map(([v, l]) => {
        const on = String(v) === String(value);
        return (
          <button key={String(v)} onClick={() => onChange(v)} className={cx('relative z-10 flex-1 rounded-xl py-2 text-sm font-bold transition-colors', on ? 'text-ball-ink' : 'text-ink-soft')}>
            {on && <motion.span layoutId={'seg-' + options.map((o) => o[0]).join('')} className="absolute inset-0 -z-10 rounded-xl bg-ball" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ on, children, className, ...p }) {
  return (
    <motion.button layout whileTap={{ scale: 0.94 }}
      className={cx('rounded-full border px-3.5 py-2 text-[15px] font-semibold transition-colors',
        on ? 'border-ball/70 bg-ball/15 text-ball' : 'border-white/10 bg-night-800 text-ink-soft hover:text-ink', className)} {...p}>
      {children}
    </motion.button>
  );
}

export function Stat({ value, label, accent }) {
  return (
    <div className="flex-1 rounded-2xl border border-white/[.06] bg-night-950/40 px-3 py-2.5">
      <motion.div key={String(value)} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={cx('text-2xl font-black tnum', accent && 'text-ball')}>{value}</motion.div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-mute">{label}</div>
    </div>
  );
}

export function Pill({ tone = 'teal', children }) {
  const t = { teal: 'bg-teal/15 text-teal', amber: 'bg-amber/15 text-amber', rose: 'bg-rose/15 text-rose', ball: 'bg-ball/15 text-ball' }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold', t)}>{children}</span>;
}

export function Sheet({ open, onClose, children, title, right }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] border border-white/10 bg-night-850 px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3"
            initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(e, i) => { if (i.offset.y > 110) onClose(); }}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15" />
            {(title || right) && <div className="mb-3 flex items-center justify-between"><div className="text-xl font-extrabold">{title}</div>{right}</div>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Empty({ icon, children }) {
  return <div className="flex flex-col items-center gap-3 py-12 text-center text-ink-soft">{icon}<div>{children}</div></div>;
}

export function Avatar({ name, size = 40, tone }) {
  const initials = String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const hues = ['#d8f54a', '#37d3b4', '#7aa7ff', '#ffb547', '#ff8fb1', '#b69cff'];
  const h = hues[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return <div style={{ width: size, height: size, background: tone || h, fontSize: size * 0.38 }} className="grid shrink-0 place-items-center rounded-full font-black text-night-950">{initials}</div>;
}
