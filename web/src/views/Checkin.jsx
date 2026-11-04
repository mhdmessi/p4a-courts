import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, UserPlus, ClipboardPaste, Users, ChevronDown, Check, Clock, UserX } from 'lucide-react';
import { sess, rosterList, rsvpIds, rsvpOf, dayPlayer, plan, sitText, actions, niceDate, nameOf } from '../lib/store.js';
import { useApp } from '../lib/hooks.js';
import { Card, Label, Button, Chip, Seg, Stat, Avatar, cx } from '../ui/kit.jsx';
import Loading from './Loading.jsx';

const isHere = (id) => !!(dayPlayer(id) || {}).present;

function Row({ id, here, sub }) {
  return (
    <motion.button layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
      whileTap={{ scale: 0.98 }} onClick={() => actions.toggleHere(id)}
      className={cx('flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors',
        here ? 'border-ball/40 bg-ball/10' : 'border-white/[.06] bg-night-800/70')}>
      <Avatar name={nameOf(id)} size={32} />
      <div className="min-w-0 flex-1"><div className="truncate font-semibold">{nameOf(id)}</div>{sub && <div className="text-xs text-ink-mute">{sub}</div>}</div>
      <span className={cx('grid h-8 w-8 place-items-center rounded-full', here ? 'bg-ball text-ball-ink' : 'border border-white/15 text-ink-mute')}>
        {here ? <Check size={17} strokeWidth={3} /> : <Clock size={15} />}
      </span>
    </motion.button>
  );
}

export default function Checkin() {
  useApp();
  const s = sess();
  const [name, setName] = useState('');
  const [paste, setPaste] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  if (!s.id) return <Loading />;
  const p = plan();
  const signed = rsvpIds('in');
  const hereIds = s.players.filter((x) => x.present).map((x) => x.id).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const waiting = signed.filter((id) => !isHere(id));
  const others = rosterList().filter((x) => !isHere(x.id) && rsvpOf(x.id) !== 'in');

  return (
    <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
    <div className="space-y-3">
      <div className="flex gap-2">
        <Stat value={p.n} label="Here" accent />
        <Stat value={p.courts || 0} label="Courts" />
        <Stat value={p.sit} label="Sit / round" />
      </div>

      {waiting.length > 0 && !hereIds.length && (
        <Button variant="teal" size="lg" className="w-full" onClick={actions.checkInAll}><Users size={20} />Check in all {waiting.length} who signed up</Button>
      )}

      <Card>
        <div className="flex items-center justify-between"><Label>Here · {hereIds.length}</Label><span className="text-xs text-ink-mute">{niceDate(s.date)}</span></div>
        <p className="mt-1 text-xs text-ink-mute">Tap someone to take them out (no-show or leaving).</p>
        <div className="mt-3 grid gap-1.5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <AnimatePresence initial={false}>{hereIds.map((id) => <Row key={id} id={id} here sub={rsvpOf(id) === 'in' ? null : 'Walk-in'} />)}</AnimatePresence>
          {!hereIds.length && <div className="text-sm text-ink-mute">Nobody checked in yet.</div>}
        </div>
      </Card>

      {waiting.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <Label>Signed up, not here yet · {waiting.length}</Label>
            {hereIds.length > 0 && <button onClick={actions.checkInAll} className="text-xs font-bold text-teal">Check in all</button>}
          </div>
          <p className="mt-1 text-xs text-ink-mute">Tap when they arrive. Anyone still here at the start just doesn't play.</p>
          <div className="mt-3 space-y-1.5">
            <AnimatePresence initial={false}>{waiting.map((id) => <Row key={id} id={id} here={false} />)}</AnimatePresence>
          </div>
        </Card>
      )}

    </div>
    <div className="space-y-3">
      <Card>
        <Label>Walk-ins</Label>
        <div className="mt-3 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New player's name" />
          <Button variant="secondary" onClick={() => { actions.addHere(name); setName(''); }}><UserPlus size={18} /></Button>
        </div>
        <button onClick={() => setShowOthers(!showOthers)} className="mt-3 flex items-center gap-1 text-sm font-semibold text-ink-soft">
          <ChevronDown size={16} className={cx('transition', showOthers && 'rotate-180')} />Regulars who didn't sign up · {others.length}
        </button>
        {showOthers && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {others.map((x) => <Chip key={x.id} className="!px-3 !py-1.5 !text-sm" onClick={() => actions.toggleHere(x.id)}>{x.name}{rsvpOf(x.id) === 'out' && <UserX size={13} className="ml-1 inline text-rose" />}</Chip>)}
          </div>
        )}
        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-ink-mute"><ClipboardPaste size={14} />Paste a list of names<ChevronDown size={14} className="transition group-open:rotate-180" /></summary>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} className="mt-2 min-h-[100px]" placeholder="One name per line. Add a rating to set it (Bilal Majeed 3.4)." />
          <Button variant="secondary" className="mt-2 w-full" onClick={() => { actions.pasteHere(paste); setPaste(''); }}>Add and check in</Button>
        </details>
      </Card>

      <Card>
        <Label>Courts available</Label>
        <Seg className="mt-3" value={s.courts} onChange={(v) => actions.setSession('courts', v)} options={[[3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']]} />
        <p className="mt-3 text-sm text-ink-soft">{sitText()}</p>
      </Card>

      <div className="sticky bottom-[calc(88px+env(safe-area-inset-bottom))] z-10 pt-1 lg:bottom-4">
        {s.rounds.length
          ? <Button size="lg" className="w-full" onClick={() => actions.setTab('play')}>Back to round {s.rounds.length} →</Button>
          : <Button size="lg" className="w-full" disabled={p.courts < 1} onClick={actions.start}><Play size={20} fill="currentColor" />Start round 1 · {p.n} players</Button>}
      </div>
    </div>
    </div>
  );
}
