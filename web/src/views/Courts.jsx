import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Maximize2, Copy, RotateCcw, Flag, Crown, Armchair, Trophy, Undo2, UserPlus, ChevronDown, Star } from 'lucide-react';
import { S, E, sess, plan, curRound, roundDone, roundStarted, rating, hasRating, nameOf, firstName, actions, setUI, copy, lineupText, upNextSitters, myMorning, blank } from '../lib/store.js';
import { useApp } from '../lib/hooks.js';
import { Card, Label, Button, Chip, Empty, cx } from '../ui/kit.jsx';
import Loading from './Loading.jsx';

export function CourtCard({ round, r, k, compact }) {
  const c = round.courts[k];
  const w = E.winnerOf(c);
  const n = round.courts.length;
  const top = k === 0 && n > 1;
  const avg = [...c.a, ...c.b].reduce((t, id) => t + rating(id), 0) / 4;
  const warn = w && round.timed ? '' : E.scoreWarning(c.sa, c.sb, Number(S.settings.target), Number(S.settings.winBy), round.timed);
  const mine = [...c.a, ...c.b].includes(S.me);
  const Side = ({ code, ids, pts }) => {
    const won = w === code, lost = w && !won;
    return (
      <motion.button whileTap={{ scale: 0.985 }} onClick={() => setUI({ sheet: { type: 'score', r, k, side: code } })}
        className={cx('relative flex w-full items-center gap-3 px-4 text-left', compact ? 'py-2.5' : 'py-4', won && 'bg-gradient-to-r from-ball/30 to-transparent')}>
        <div className="min-w-0 flex-1">
          {ids.map((id) => (
            <div key={id} className={cx('truncate font-extrabold text-white drop-shadow', compact ? 'text-[15px]' : 'text-[18px]', lost && 'opacity-60')}>
              {won && <Trophy size={14} className="mr-1 inline -translate-y-0.5 text-ball" />}{nameOf(id)}
              {id === S.me && <Star size={13} className="ml-1 inline -translate-y-0.5 fill-ball text-ball" />}
              {hasRating(id) && <span className="ml-1.5 text-xs font-semibold text-white/55 tnum">{rating(id).toFixed(2)}</span>}
            </div>
          ))}
        </div>
        <div className={cx('min-w-[48px] text-right font-black tnum', compact ? 'text-2xl' : 'text-4xl', won ? 'text-ball' : 'text-white/35')}>{blank(pts) ? (won ? 'W' : '–') : pts}</div>
      </motion.button>
    );
  };
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.04 }}
      className={cx('court-surface court-kitchen relative overflow-hidden rounded-[22px] border-2 shadow-card', w ? 'border-ball' : mine ? 'border-ball/60' : 'border-white/70')}>
      <div className="absolute left-3 top-2.5 z-10 flex items-center gap-1.5">
        <span className={cx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wider', top ? 'bg-gold text-[#3a2a00]' : 'bg-black/35 text-white')}>
          {top && <Crown size={11} />}Court {k + 1}
        </span>
      </div>
      <span className="absolute right-3 top-2.5 z-10 rounded-full bg-black/25 px-2 py-0.5 text-[10.5px] font-bold text-white/75 tnum">{avg.toFixed(2)}</span>
      <div className={compact ? 'pt-7' : 'pt-8'}><Side code="A" ids={c.a} pts={c.sa} /></div>
      <div className="relative h-0 border-t-[3px] border-dashed border-white/90">
        <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded bg-court px-1.5 text-[9px] font-black tracking-[.2em] text-white">NET</span>
      </div>
      <Side code="B" ids={c.b} pts={c.sb} />
      {warn ? <div className="pb-2 text-center text-xs font-bold text-amber">⚠ {warn}</div>
        : !w && !compact && <div className="pb-2 text-center text-[11.5px] text-white/55">Tap the winning team</div>}
    </motion.div>
  );
}

function MyBanner({ round }) {
  if (!S.me || !round) return null;
  if (round.sitting.includes(S.me)) return <div className="flex items-center gap-3 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-amber"><Armchair size={20} /><b>You're sitting out this round.</b></div>;
  const k = round.courts.findIndex((c) => [...c.a, ...c.b].includes(S.me));
  if (k < 0) return null;
  const c = round.courts[k];
  const mine = c.a.includes(S.me) ? c.a : c.b, them = c.a.includes(S.me) ? c.b : c.a;
  return (
    <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-3 rounded-2xl border border-ball/40 bg-ball/10 px-4 py-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ball text-xl font-black text-ball-ink">{k + 1}</div>
      <div className="text-[15px]"><div className="font-extrabold text-ball">You're on Court {k + 1}</div>
        <div className="text-ink-soft">with <b className="text-ink">{firstName(mine.find((x) => x !== S.me))}</b> vs {them.map(firstName).join(' & ')}</div></div>
    </motion.div>
  );
}

function MyMorning() {
  const [open, setOpen] = useState(false);
  if (!S.me) return null;
  const rows = myMorning(S.me);
  if (!rows.length) return null;
  const wins = rows.filter((x) => x.won === true).length, losses = rows.filter((x) => x.won === false).length;
  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between">
        <Label>My morning · {wins}-{losses}</Label><ChevronDown size={16} className={cx('text-ink-mute transition', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-1.5">
              {rows.map((x) => (
                <div key={x.r} className="flex items-center gap-3 text-sm">
                  <span className="w-7 text-xs font-bold text-ink-mute">R{x.r + 1}</span>
                  {x.sat ? <span className="text-amber">Sat out</span> : x.away ? <span className="text-ink-mute">Not here</span> : (<>
                    <span className="rounded-md bg-night-700 px-1.5 py-0.5 text-xs font-bold">C{x.k + 1}</span>
                    <span className="flex-1 truncate">w/ <b>{firstName(x.mate)}</b> vs {x.them.map(firstName).join(' & ')}</span>
                    <span className={cx('font-bold tnum', x.won === true ? 'text-ball' : x.won === false ? 'text-rose' : 'text-ink-mute')}>{x.won === null ? 'playing' : (x.won ? 'W ' : 'L ') + (x.score || '')}</span>
                  </>)}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function Courts() {
  useApp();
  const s = sess();
  const [late, setLate] = useState('');
  if (!s.id) return <Loading />;
  const p = plan();
  if (!s.rounds.length) {
    return (
      <Empty icon={<motion.img src="icon.svg" alt="" className="h-16 w-16" animate={{ rotate: [0, 8, -8, 0] }} transition={{ repeat: Infinity, duration: 2.4 }} />}>
        <div className="text-lg font-bold text-ink">No round yet</div>
        <div className="mb-5 text-sm">{p.n} checked in · {p.courts ? `${p.courts} courts` : 'need 4+ to start'}</div>
        <Button size="lg" disabled={p.courts < 1} onClick={actions.start}><Play size={20} fill="currentColor" />Start round 1</Button>
      </Empty>
    );
  }
  const r = s.rounds.length - 1;
  const round = s.rounds[r];
  const st = E.derive(s);
  const done = roundDone(round);
  const doneCount = round.courts.filter((c) => E.winnerOf(c)).length;
  const next = upNextSitters().filter(Boolean);
  const armed = S.ui.armed === 'undo';

  return (
    <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:space-y-0">
    <div className="space-y-3">
      <MyBanner round={round} />
      <div className="flex items-end justify-between px-1">
        <div><Label>Round</Label><div className="text-3xl font-black leading-none">{r + 1}<span className="ml-1 text-base font-bold text-ink-mute">/ ~{S.settings.rounds}</span></div></div>
        <Button variant="secondary" size="sm" onClick={() => setUI({ display: true })}><Maximize2 size={15} />Show players</Button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-night-700">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-teal to-ball" animate={{ width: `${(doneCount / round.courts.length) * 100}%` }} />
      </div>
      {round.sitting.length > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber/30 bg-amber/[.07] px-4 py-2.5 text-sm text-amber">
          <Armchair size={17} /><span>Sitting: {round.sitting.map((id) => <b key={id} className="text-ink">{nameOf(id)}</b>).reduce((a, b, i) => (i ? [...a, ', ', b] : [b]), [])}</span>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{round.courts.map((_, k) => <CourtCard key={k} round={round} r={r} k={k} />)}</div>

      {next.length > 0 && <div className="px-1 text-[12.5px] text-ink-mute">Up next to sit: {next.map(nameOf).join(', ')}</div>}

      <div className="sticky bottom-[calc(88px+env(safe-area-inset-bottom))] z-10 pt-1 lg:bottom-4">
        <Button size="lg" className="w-full" disabled={!done || p.courts < 1} onClick={actions.start}>
          {done ? <><Play size={20} fill="currentColor" />Start round {r + 2}</> : `${doneCount} of ${round.courts.length} courts done`}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="sm" onClick={() => copy(lineupText())}><Copy size={15} />Lineup</Button>
        <Button variant="secondary" size="sm" disabled={roundStarted(round)} onClick={actions.redo}><RotateCcw size={15} />Redo</Button>
        <Button variant="secondary" size="sm" onClick={() => actions.setTab('results')}><Flag size={15} />Finish</Button>
      </div>

    </div>
    <div className="space-y-3">
      <MyMorning />

      <Card>
        <Label>Who's here</Label>
        <p className="mt-1 text-xs text-ink-mute">Late or leaving? Tap a name; changes apply next round. Number = rounds sat.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {s.players.slice().sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id))).map((pl) => (
            <Chip key={pl.id} on={pl.present} className="!px-3 !py-1.5 !text-sm" onClick={() => actions.toggleHere(pl.id)}>
              {nameOf(pl.id)}{pl.joinRound != null && <span className="ml-1 opacity-60 tnum">{st[pl.id].sits}</span>}
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={late} onChange={(e) => setLate(e.target.value)} placeholder="Late arrival's name" />
          <Button variant="secondary" onClick={() => { actions.addHere(late); setLate(''); }}><UserPlus size={18} /></Button>
        </div>
      </Card>

      {r > 0 && (
        <Card>
          <Label>Earlier rounds</Label>
          <div className="mt-2 space-y-2">
            {s.rounds.slice(0, r).map((rd, i) => ({ rd, i })).reverse().map(({ rd, i }) => (
              <details key={i} className="group rounded-2xl bg-night-950/40 px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
                  <span>Round {i + 1}{rd.sitting.length ? <span className="ml-2 font-normal text-ink-mute">sat: {rd.sitting.map(firstName).join(', ')}</span> : null}</span>
                  <ChevronDown size={16} className="text-ink-mute transition group-open:rotate-180" />
                </summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-1">{rd.courts.map((_, k) => <CourtCard key={k} round={rd} r={i} k={k} compact />)}</div>
              </details>
            ))}
          </div>
        </Card>
      )}

      <Button variant={armed ? 'danger' : 'ghost'} className="w-full" onClick={() => (armed ? (setUI({ armed: null }), actions.undo()) : setUI({ armed: 'undo' }))}>
        <Undo2 size={17} />{armed ? `Tap again to delete round ${r + 1}` : `Undo round ${r + 1}`}
      </Button>
    </div>
    </div>
  );
}
