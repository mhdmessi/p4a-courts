import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Share2, Copy, MapPin, Clock, UserPlus, ChevronDown } from 'lucide-react';
import { S, sess, rosterList, rsvpIds, rsvpOf, person, nameOf, niceDate, sessionList, todayStr, actions, openSession, copy, shareLink, blank, capOf, confirmedIds, waitlistIds, isAdmin } from '../lib/store.js';
import { useApp } from '../lib/hooks.js';
import { Card, Label, Button, Chip, Avatar, Pill, cx } from '../ui/kit.jsx';
import Loading from './Loading.jsx';

export default function Signup() {
  useApp();
  const s = sess();
  const [newName, setNewName] = useState('');
  const [showAll, setShowAll] = useState(false);
  if (!s.id) return <Loading />;
  const allIn = rsvpIds('in'), outs = rsvpIds('out');
  const ins = confirmedIds(), wait = waitlistIds(), cap = capOf(s), full = allIn.length >= cap;
  const answered = new Set([...allIn, ...outs]);
  const noReply = rosterList().filter((p) => !answered.has(p.id));
  const me = S.me && S.roster[S.me] ? S.me : null;
  const mine = me ? rsvpOf(me) : null;
  const courts = Math.min(Number(s.courts), Math.floor(ins.length / 4));
  const sitting = courts ? ins.length - courts * 4 : 0;
  const upcoming = sessionList().filter((x) => x.date >= todayStr());

  const share = async () => {
    const txt = `🟡 P4A ${niceDate(s.date)} ${s.time}: tap to sign up\n${shareLink()}`;
    if (navigator.share) { try { await navigator.share({ text: txt }); } catch (e) { /* cancelled */ } } else copy(txt);
  };

  return (
    <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
    <div className="space-y-3">
      {/* Session hero */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 p-5 court-surface">
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/40" />
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-ball/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[13px] font-bold uppercase tracking-widest text-white/70">Next session</div>
              <div className="mt-1 text-[26px] font-black leading-tight">{niceDate(s.date, true)}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-white/80">
                <span className="flex items-center gap-1"><Clock size={14} />{s.time}</span>
                <span className="flex items-center gap-1"><MapPin size={14} />{S.settings.location}</span>
              </div>
            </div>
            {upcoming.length > 1 && (
              <select value={s.id} onChange={(e) => openSession(e.target.value)} className="!w-auto !bg-black/25 !border-white/20 !py-1.5 text-sm">
                {upcoming.map((x) => <option key={x.id} value={x.id}>{niceDate(x.date)}</option>)}
              </select>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[[`${ins.length}/${cap}`, full ? 'Full' : 'In'], [wait.length, 'Waitlist'], [courts, courts === 1 ? 'Court' : 'Courts']].map(([v, l]) => (
              <div key={l} className="rounded-2xl bg-black/25 px-3 py-2 backdrop-blur">
                <motion.div key={v} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="text-2xl font-black tnum">{v}</motion.div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/70">{l}</div>
              </div>
            ))}
          </div>
          {ins.length >= 4 && <div className="mt-2 text-[12.5px] text-white/75">{sitting ? `${sitting} sit out each round, taking turns evenly.` : 'Everyone plays every round.'}</div>}
        </div>
      </div>

      {/* Me */}
      <Card>
        {!me ? (
          <>
            <Label>Who are you?</Label>
            <p className="mt-1 text-sm text-ink-soft">Tap your name once. This phone remembers you.</p>
            <div className={cx('mt-3 flex flex-wrap gap-2 overflow-hidden', !showAll && 'max-h-[176px]')}>
              {rosterList().map((p) => <Chip key={p.id} onClick={() => actions.iam(p.id)}>{p.name}</Chip>)}
            </div>
            {rosterList().length > 14 && (
              <button onClick={() => setShowAll(!showAll)} className="mt-2 flex items-center gap-1 text-sm font-semibold text-ink-soft">
                <ChevronDown size={16} className={cx('transition', showAll && 'rotate-180')} />{showAll ? 'Show less' : 'Show everyone'}
              </button>
            )}
            <div className="mt-3 flex gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New here? Your name" />
              <Button variant="secondary" onClick={() => { actions.newMe(newName); setNewName(''); }}><UserPlus size={18} /></Button>
            </div>
          </>
        ) : <MeCard me={me} mine={mine} waitPos={wait.indexOf(me) + 1} full={full} />}
      </Card>

    </div>
    <div className="space-y-3">
      {/* Lists */}
      <Card>
        <div className="flex items-center justify-between"><Label>In · {ins.length} of {cap}</Label>{ins.length > 0 && <Pill tone="ball">{courts} court{courts === 1 ? '' : 's'}</Pill>}</div>
        <div className="mt-3 space-y-1.5">
          <AnimatePresence initial={false}>
            {ins.map((id, i) => (
              <motion.div key={id} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                className={cx('flex items-center gap-3 rounded-2xl px-2 py-1.5', id === me && 'bg-ball/10')}>
                <span className="w-5 text-right text-xs font-bold text-ink-mute tnum">{i + 1}</span>
                <Avatar name={nameOf(id)} size={30} />
                <span className="flex-1 font-semibold">{nameOf(id)}{id === me && <span className="ml-1 text-ball">· you</span>}</span>
                <span className="text-xs text-ink-mute tnum">{blank(person(id).rating) ? '' : Number(person(id).rating).toFixed(2)}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {!ins.length && <div className="text-sm text-ink-mute">Nobody yet. Be the first.</div>}
        </div>
        {wait.length > 0 && (<>
          <Label className="mt-5">Waitlist · {wait.length}</Label>
          <p className="mt-1 text-xs text-ink-mute">They move in automatically, in order, when someone drops.</p>
          <div className="mt-2 space-y-1">{wait.map((id, i) => (
            <div key={id} className={cx('flex items-center gap-3 rounded-2xl px-2 py-1.5', id === me && 'bg-ball/10')}>
              <span className="w-5 text-right text-xs font-bold text-amber tnum">#{i + 1}</span><Avatar name={nameOf(id)} size={26} /><span className="font-semibold text-ink-soft">{nameOf(id)}</span>
            </div>))}</div>
        </>)}
        {outs.length > 0 && (<>
          <Label className="mt-5">Can't make it · {outs.length}</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">{outs.map((id) => <span key={id} className="rounded-full bg-night-800 px-3 py-1 text-sm text-ink-soft">{nameOf(id)}</span>)}</div>
        </>)}
        {noReply.length > 0 && (
          <details className="mt-4 group">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink-mute">No answer yet · {noReply.length} <ChevronDown size={14} className="inline transition group-open:rotate-180" /></summary>
            <div className="mt-2 flex flex-wrap gap-1.5">{noReply.map((p) => <span key={p.id} className="rounded-full bg-night-800 px-3 py-1 text-sm text-ink-mute">{p.name}</span>)}</div>
          </details>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={share}><Share2 size={18} />Share link</Button>
        <Button variant="secondary" onClick={() => copy(`🟡 P4A ${niceDate(s.date)} ${s.time} · ${ins.length} in\n` + ins.map((id, i) => `${i + 1}. ${nameOf(id)}`).join('\n') + `\nSign up: ${shareLink()}`)}><Copy size={18} />Copy list</Button>
      </div>
    </div>
    </div>
  );
}

function MeCard({ me, mine, waitPos, full }) {
  const p = person(me);
  const [r, setR] = useState(blank(p.rating) ? '' : String(p.rating));
  const [d, setD] = useState(p.dupr || '');
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={p.name} size={44} />
        <div className="flex-1">
          <div className="text-lg font-extrabold">Hi {p.name.split(' ')[0]} 👋</div>
          <div className="text-sm text-ink-soft">{mine === 'in' ? (waitPos ? `You're #${waitPos} on the waitlist.` : "You're in. See you on the court!") : mine === 'out' ? "Marked as can't make it." : full ? 'Session is full. Join the waitlist?' : 'Are you playing?'}</div>
        </div>
        <button onClick={actions.notMe} className="text-sm font-semibold text-ink-mute">Not you?</button>
      </div>
      {mine === 'in' ? (
        <div className="mt-4 space-y-2">
          <div className={cx('flex h-14 items-center justify-center gap-2 rounded-2xl text-lg font-black', waitPos ? 'border border-amber/40 bg-amber/10 text-amber' : 'grad text-white shadow-glow')}>
            <Check size={22} strokeWidth={3} />{waitPos ? `Waitlist #${waitPos}` : "You're in"}
          </div>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => actions.rsvp('out')} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose/40 bg-rose/10 font-bold text-rose">
            <X size={18} strokeWidth={3} />Can't make it anymore
          </motion.button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => actions.rsvp('in')}
            className="grad flex h-16 items-center justify-center gap-2 rounded-2xl text-lg font-black text-white shadow-glow">
            <Check size={22} strokeWidth={3} />{full ? 'Join waitlist' : "I'm in"}
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => actions.rsvp('out')}
            className={cx('flex h-16 items-center justify-center gap-2 rounded-2xl text-lg font-black transition-colors', mine === 'out' ? 'bg-rose text-white' : 'border border-white/10 bg-white/[.05] text-ink')}>
            <X size={22} strokeWidth={3} />Can't
          </motion.button>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/[.04] px-3 py-2 text-sm">
        <span className="text-ink-mute">DUPR rating</span>
        <span className="font-bold tnum">{blank(p.rating) ? 'Not set yet' : Number(p.rating).toFixed(2)}{p.dupr ? <span className="ml-2 font-normal text-ink-mute">{p.dupr}</span> : null}</span>
      </div>
      {isAdmin() && (
        <div className="mt-2 flex gap-2">
          <input value={r} onChange={(e) => setR(e.target.value)} inputMode="decimal" placeholder="Rating" />
          <input value={d} onChange={(e) => setD(e.target.value)} placeholder="DUPR ID" />
          <Button variant="secondary" onClick={() => actions.saveMe(r, d)}>Save</Button>
        </div>
      )}
    </>
  );
}
