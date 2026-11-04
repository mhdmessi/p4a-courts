import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Crown, Armchair, Flame } from 'lucide-react';
import { S, E, sess, curRound, nameOf, firstName, person, hasRating, rating, rankData, allGames, groupRatingMap, actions, setUI, niceDate, blank } from '../lib/store.js';
import { useApp, useTimer } from '../lib/hooks.js';
import { Sheet, Button, Avatar, Stat, cx } from '../ui/kit.jsx';

function ScoreSheet({ r, k, side: initSide }) {
  const round = sess().rounds[r];
  const [side, setSide] = useState(initSide || (round && E.winnerOf(round.courts[k])) || null);
  const c0 = round && round.courts[k];
  const [a, setA] = useState(c0 && !blank(c0.sa) ? String(c0.sa) : '');
  const [b, setB] = useState(c0 && !blank(c0.sb) ? String(c0.sb) : '');
  if (!round) return null;
  const c = round.courts[k];
  const target = Number(S.settings.target);
  const team = (ids) => ids.map(firstName).join(' & ');
  const close = () => setUI({ sheet: null });
  const save = () => {
    let x = a.replace(/\D/g, ''), y = b.replace(/\D/g, '');
    if (x === '' && side === 'A') x = String(target);
    if (y === '' && side === 'B') y = String(target);
    if (x === '' || y === '' || +x === +y) return;
    actions.setScore(r, k, +x, +y, +x > +y ? 'A' : 'B');
  };
  return (
    <Sheet open onClose={close} title={`Court ${k + 1}`} right={<span className="text-sm text-ink-mute">Round {r + 1}{round.timed ? ' · timed' : ''}</span>}>
      {!side ? (
        <>
          <p className="mb-3 text-ink-soft">Who won?</p>
          <div className="grid gap-2">
            {['A', 'B'].map((sd) => (
              <motion.button key={sd} whileTap={{ scale: 0.98 }} onClick={() => setSide(sd)} className="rounded-2xl border-2 border-white/10 bg-night-800 p-4 text-left text-lg font-extrabold">
                {team(sd === 'A' ? c.a : c.b)}
              </motion.button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-ball/10 px-3 py-2.5">
            <span className="flex items-center gap-2 font-extrabold text-ball"><Trophy size={18} />{team(side === 'A' ? c.a : c.b)}</span>
            <button onClick={() => setSide(null)} className="text-sm font-semibold text-ink-soft">Change</button>
          </div>
          <p className="mb-2 text-sm text-ink-soft">{team(side === 'A' ? c.b : c.a)} scored:</p>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: target - 1 }, (_, i) => (
              <motion.button key={i} whileTap={{ scale: 0.9 }} onClick={() => (side === 'A' ? actions.setScore(r, k, target, i, 'A') : actions.setScore(r, k, i, target, 'B'))}
                className="h-14 rounded-2xl border border-white/10 bg-night-800 text-2xl font-black tnum active:bg-ball active:text-ball-ink">{i}</motion.button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-xs text-ink-mute">{round.timed ? 'Time ran out, close game or other score:' : 'Close game or other score:'}</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="text-center text-xs text-ink-mute">{team(c.a)}<input value={a} onChange={(e) => setA(e.target.value)} inputMode="numeric" placeholder={side === 'A' ? String(target) : ''} className="mt-1 !text-center !text-2xl !font-black" /></label>
            <span className="pb-3 text-ink-mute">–</span>
            <label className="text-center text-xs text-ink-mute">{team(c.b)}<input value={b} onChange={(e) => setB(e.target.value)} inputMode="numeric" placeholder={side === 'B' ? String(target) : ''} className="mt-1 !text-center !text-2xl !font-black" /></label>
          </div>
          <Button className="mt-3 w-full" onClick={save}>Save score</Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => actions.setScore(r, k, '', '', side)}>Winner only (won't go to DUPR)</Button>
        </>
      )}
      {E.winnerOf(c) && <Button variant="ghost" className="mt-2 w-full" onClick={() => actions.setScore(r, k, '', '', null)}>Clear result</Button>}
    </Sheet>
  );
}

function PlayerSheet({ id }) {
  const p = person(id);
  const card = E.playerCard(allGames(), p.name);
  const { list } = rankData();
  const rk = list.filter((x) => x.qualified).findIndex((x) => x.id === id);
  const me = list.find((x) => x.id === id);
  const gr = groupRatingMap()[p.name];
  const Row = ({ k, v }) => <div className="flex items-center justify-between py-2"><span className="text-ink-soft">{k}</span><b>{v}</b></div>;
  return (
    <Sheet open onClose={() => setUI({ sheet: null })}>
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={p.name} size={56} />
        <div><div className="text-xl font-black">{p.name}</div>
          <div className="text-sm text-ink-soft">{hasRating(id) ? 'DUPR ' + rating(id).toFixed(2) : 'No rating'}{p.dupr ? ' · ' + p.dupr : ''}</div></div>
      </div>
      <div className="flex gap-2">
        <Stat value={me ? `${me.wins}-${me.games - me.wins}` : '–'} label="Record" />
        <Stat value={me ? me.pfg.toFixed(1) : '–'} label="Pts / game" accent />
        <Stat value={rk >= 0 ? '#' + (rk + 1) : '–'} label="Rank" />
      </div>
      <div className="mt-3 divide-y divide-white/[.05]">
        <Row k="Live rating" v={gr && gr.games ? <>{gr.rating.toFixed(2)}{hasRating(id) && <span className="ml-1 text-xs font-normal text-ink-mute">({(gr.rating - rating(id) >= 0 ? '+' : '') + (gr.rating - rating(id)).toFixed(2)})</span>}</> : '–'} />
        <Row k="Point +/- per game" v={me ? (me.diff > 0 ? '+' : '') + me.diff.toFixed(1) : '–'} />
        <Row k="Saturdays played" v={me ? me.days : 0} />
        <Row k="Current streak" v={card.streak > 0 ? <span className="text-[#ff8a3d]"><Flame size={14} className="inline" /> {card.streak} W</span> : card.streak < 0 ? -card.streak + ' L' : '–'} />
        <Row k="Best partner" v={card.bestPartner ? `${card.bestPartner.name.split(' ')[0]} (${card.bestPartner.w}-${card.bestPartner.g - card.bestPartner.w})` : '–'} />
      </div>
    </Sheet>
  );
}

function TimerSheet() {
  return (
    <Sheet open onClose={() => setUI({ sheet: null })} title="Round timer">
      <div className="grid gap-2">
        <Button variant="secondary" onClick={() => actions.timer('add')}>+1 minute</Button>
        <Button variant="secondary" onClick={() => actions.timer('restart')}>Restart {S.settings.timerMin}:00</Button>
        <Button variant="ghost" onClick={() => actions.timer('off')}>Turn off for this round</Button>
      </div>
    </Sheet>
  );
}

function Display() {
  const s = sess();
  const round = curRound();
  const t = useTimer();
  if (!round) return null;
  return (
    <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-night-950 px-5 pb-10 pt-[calc(18px+env(safe-area-inset-top))]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button onClick={() => setUI({ display: false })} className="fixed right-4 top-[calc(14px+env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full bg-night-700"><X /></button>
      <div className="text-sm font-bold uppercase tracking-[.2em] text-ink-mute">{niceDate(s.date)}</div>
      <div className="flex items-baseline gap-4"><h1 className="text-5xl font-black">Round {s.rounds.length}</h1>{t && !t.idle && <span className="text-4xl font-black text-ball tnum">{t.text}</span>}</div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {round.courts.map((c, k) => (
          <motion.div key={k} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.06 }} className="court-surface rounded-3xl border-2 border-white p-5">
            <div className="flex items-center gap-1.5 text-sm font-black uppercase tracking-[.18em] text-ball">{k === 0 && round.courts.length > 1 && <Crown size={16} />}Court {k + 1}</div>
            <div className="mt-2 text-3xl font-black leading-tight">{c.a.map(firstName).join(' & ')}</div>
            <div className="my-1 text-xs font-black tracking-[.3em] text-white/60">VS</div>
            <div className="text-3xl font-black leading-tight">{c.b.map(firstName).join(' & ')}</div>
          </motion.div>
        ))}
      </div>
      {round.sitting.length > 0 && <div className="mt-5 flex items-center gap-3 rounded-3xl border border-amber/40 bg-amber/10 p-5 text-2xl text-amber"><Armchair size={28} />Sitting: <b className="text-ink">{round.sitting.map(firstName).join(', ')}</b></div>}
    </motion.div>
  );
}

export default function Overlays() {
  useApp();
  const sh = S.ui.sheet;
  return (
    <>
      {sh && sh.type === 'score' && <ScoreSheet key={sh.r + '-' + sh.k} r={sh.r} k={sh.k} side={sh.side} />}
      {sh && sh.type === 'card' && <PlayerSheet id={sh.id} />}
      {sh && sh.type === 'timer' && <TimerSheet />}
      <AnimatePresence>{S.ui.display && <Display />}</AnimatePresence>
      <AnimatePresence>
        {S.ui.toast && (
          <motion.div key={S.ui.toast.id} initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 10, x: '-50%' }}
            className="fixed bottom-[calc(100px+env(safe-area-inset-bottom))] left-1/2 z-[60] max-w-[90%] rounded-2xl bg-ink px-4 py-3 text-sm font-bold text-night-900 shadow-card">
            {S.ui.toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
