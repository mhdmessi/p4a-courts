import { useEffect } from 'react';
import { useApp, useTimer } from './lib/hooks.js';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarCheck, UserCheck, LayoutGrid, Trophy, MoreHorizontal, WifiOff, FlaskConical } from 'lucide-react';
import { S, start, sess, plan, niceDate, isLiveToday, actions, setUI, PRACTICE } from './lib/store.js';
import { cx } from './ui/kit.jsx';
import Signup from './views/Signup.jsx';
import Checkin from './views/Checkin.jsx';
import Courts from './views/Courts.jsx';
import Results from './views/Results.jsx';
import More from './views/More.jsx';
import Overlays from './overlays/Overlays.jsx';

start();

const TABS = [
  ['signup', 'Sign-up', CalendarCheck, Signup],
  ['today', 'Check-in', UserCheck, Checkin],
  ['play', 'Courts', LayoutGrid, Courts],
  ['results', 'Results', Trophy, Results],
  ['more', 'More', MoreHorizontal, More],
];

function TimerPill() {
  const t = useTimer();
  if (!t) return null;
  if (t.idle) return <button onClick={() => actions.timer('start')} className="rounded-xl bg-teal px-3 py-1.5 text-sm font-extrabold text-[#032a22]">▶ {S.settings.timerMin}:00</button>;
  return (
    <button onClick={() => setUI({ sheet: { type: 'timer' } })}
      className={cx('rounded-xl px-3 py-1.5 text-lg font-black tnum border', t.left <= 0 ? 'animate-pulse bg-rose border-rose text-white' : t.left <= 60 ? 'bg-amber border-amber text-[#2a1700]' : 'bg-night-700 border-white/10')}>
      {t.text}
    </button>
  );
}

export default function App() {
  useApp();
  const s = sess();
  if (!S.ui.tab) S.ui.tab = isLiveToday() ? 'play' : 'signup';
  const tab = TABS.find((t) => t[0] === S.ui.tab) || TABS[0];
  const p = plan();
  const View = tab[3];
  useEffect(() => {
    let lock;
    if (S.ui.tab === 'play' && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock && lock.release().catch(() => {}); };
  }, [S.ui.tab]);

  return (
    <div className="mx-auto min-h-screen max-w-xl pb-[calc(96px+env(safe-area-inset-bottom))] md:max-w-3xl lg:max-w-7xl lg:pb-12">
      <header className="glass sticky top-0 z-30 border-b border-white/[.05] px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] lg:px-8">
        <div className="flex items-center gap-3">
          <img src="icon.svg" alt="" className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[17px] font-black tracking-tight"><span className="grad-text">P4A Courts</span>
              {PRACTICE && <span className="flex items-center gap-1 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-bold text-amber"><FlaskConical size={11} /> PRACTICE</span>}
              {!S.online && <span className="flex items-center gap-1 rounded-full bg-rose/15 px-2 py-0.5 text-[10px] font-bold text-rose"><WifiOff size={11} /> OFFLINE</span>}
            </div>
            <div className="truncate text-[12.5px] text-ink-soft">
              {s.id ? <>{niceDate(s.date)} · {p.n} in{p.courts ? ` · ${p.courts} courts` : ''}{s.rounds.length ? ` · round ${s.rounds.length}` : ''}</> : 'Loading…'}
            </div>
          </div>
          <nav className="mr-2 hidden items-center gap-1 lg:flex">
            {TABS.map(([key, label, Icon]) => {
              const on = key === tab[0];
              return (
                <button key={key} onClick={() => actions.setTab(key)} className={cx('relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors', on ? 'text-ball' : 'text-ink-soft hover:text-ink')}>
                  {on && <motion.span layoutId="toppill" className="absolute inset-0 rounded-xl" style={{ background: 'rgba(167,139,250,.16)' }} transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <Icon size={18} className="relative" /><span className="relative">{label}</span>
                </button>
              );
            })}
          </nav>
          <TimerPill />
        </div>
      </header>

      <main className="px-4 pt-4 lg:px-8 lg:pt-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab[0]} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <View />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="px-4 pb-4 pt-10 text-center text-xs text-ink-mute lg:px-8">
        Designed and built by <a href="https://mhdstudios.com" target="_blank" rel="noopener" className="font-bold text-ink-soft hover:text-ink">MHD Studios</a>
      </footer>

      <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t border-white/[.06] pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex max-w-xl justify-around px-2 py-1.5">
          {TABS.map(([key, label, Icon]) => {
            const on = key === tab[0];
            return (
              <button key={key} onClick={() => actions.setTab(key)} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2">
                {on && <motion.span layoutId="navpill" className="absolute inset-x-2 inset-y-0.5 rounded-2xl bg-ball/12" style={{ background: 'rgba(167,139,250,.16)' }} transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <Icon size={22} strokeWidth={on ? 2.6 : 2} className={cx('relative', on ? 'text-ball' : 'text-ink-mute')} />
                <span className={cx('relative text-[11px] font-bold', on ? 'text-ball' : 'text-ink-mute')}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Overlays />
    </div>
  );
}
