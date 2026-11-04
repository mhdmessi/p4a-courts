import { useState } from 'react';
import { motion } from 'framer-motion';
import { Award, Flame, Users, Crown, CheckCircle2, AlertCircle, Send, Download, Copy, ExternalLink, Medal } from 'lucide-react';
import { S, E, sess, todayRows, duprStatus, duprFile, rankData, nameOf, firstName, niceDate, actions, setUI, copy, download, toast } from '../lib/store.js';
import { useApp } from '../lib/hooks.js';
import { Card, Label, Button, Seg, Avatar, Pill, cx } from '../ui/kit.jsx';

const AWARD_ICON = { MVP: Award, 'On fire': Flame, 'Best duo': Users, 'Top court king': Crown };

function Today() {
  const s = sess();
  const rows = s.id ? todayRows(s) : [];
  if (!rows.length) return null;
  const awards = E.dayAwards(s);
  const d = duprStatus();
  const sendDupr = async () => {
    const out = duprFile();
    const file = new File([out.csv], `dupr-${s.date}.csv`, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'DUPR ' + s.date }); } catch (e) { /* cancelled */ } }
    else { download(file.name, out.csv); toast('Downloaded ' + out.rows + ' games. Send the file to Bilal.'); }
  };
  const recap = () => copy(`🟡 P4A ${niceDate(s.date)} recap (${s.rounds.length} rounds)\n` +
    (awards.length ? awards.map((a) => `🏅 ${a.title}: ${a.who.map(nameOf).join(' & ')} (${a.detail})`).join('\n') + '\n\n' : '') +
    rows.map((x, i) => `${i + 1}. ${nameOf(x.id)}: ${x.pf} pts (${x.pf - x.pa >= 0 ? '+' : ''}${x.pf - x.pa}), ${x.wins}-${x.games - x.wins}`).join('\n'));

  return (
    <>
      <Card>
        <div className="flex items-center justify-between"><Label>{niceDate(s.date)}</Label><Pill>{s.rounds.length} rounds</Pill></div>
        {awards.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {awards.map((a, i) => {
              const Icon = AWARD_ICON[a.title] || Award;
              return (
                <motion.div key={a.title} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }}
                  className="rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/[.12] to-transparent p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gold"><Icon size={14} />{a.title}</div>
                  <div className="mt-1 font-extrabold leading-tight">{a.who.map(firstName).join(' & ')}</div>
                  <div className="text-xs text-ink-soft">{a.detail}</div>
                </motion.div>
              );
            })}
          </div>
        )}
        <div className="mt-3 divide-y divide-white/[.05]">
          <div className="grid grid-cols-[28px_1fr_44px_44px_48px_32px] py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-mute">
            <span /><span>Player</span><span className="text-right">Pts</span><span className="text-right">+/-</span><span className="text-right">W-L</span><span className="text-right">Sat</span>
          </div>
          {rows.map((x, i) => (
            <button key={x.id} onClick={() => setUI({ sheet: { type: 'card', id: x.id } })} className={cx('grid w-full grid-cols-[28px_1fr_44px_44px_48px_32px] items-center py-2 text-left text-[15px]', x.id === S.me && 'text-ball')}>
              <span className="text-xs font-bold text-ink-mute tnum">{i + 1}</span>
              <span className="truncate font-semibold">{nameOf(x.id)}{x.streak >= 3 && <span className="ml-1 text-[#ff8a3d]">🔥{x.streak}</span>}</span>
              <span className="text-right font-black text-ball tnum">{x.pf}</span>
              <span className="text-right text-ink-soft tnum">{x.pf - x.pa > 0 ? '+' : ''}{x.pf - x.pa}</span>
              <span className="text-right tnum">{x.wins}-{x.games - x.wins}</span>
              <span className="text-right text-ink-mute tnum">{x.sits}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card id="dupr">
        <Label>DUPR</Label>
        <div className="mt-3 space-y-3">
          <div className="flex gap-3">
            {d.noScore.length ? <AlertCircle className="shrink-0 text-amber" size={22} /> : <CheckCircle2 className="shrink-0 text-teal" size={22} />}
            <div>{d.noScore.length ? <><b>{d.noScore.length} game{d.noScore.length > 1 ? 's' : ''} need a score</b>
              <div className="mt-2 flex flex-wrap gap-1.5">{d.noScore.map((g) => <button key={g.r + '-' + g.k} onClick={() => setUI({ sheet: { type: 'score', r: g.r, k: g.k } })} className="rounded-full bg-night-700 px-3 py-1 text-xs font-bold">R{g.r + 1} · C{g.k + 1}</button>)}</div></> : 'Every game has a score'}</div>
          </div>
          <div className="flex gap-3">
            {d.noId.length ? <AlertCircle className="shrink-0 text-amber" size={22} /> : <CheckCircle2 className="shrink-0 text-teal" size={22} />}
            <div className="flex-1">{d.noId.length ? <><b>{d.noId.length} player{d.noId.length > 1 ? 's' : ''} missing a DUPR ID</b>
              <div className="mt-2 space-y-1.5">{d.noId.map((id) => <IdRow key={id} id={id} />)}</div></> : 'Everyone has a DUPR ID'}</div>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-soft"><b className="text-ink">{d.ready}</b> of {d.total} games ready to submit.</p>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <Button disabled={!d.ready} onClick={sendDupr}><Send size={18} />Send DUPR file</Button>
          <Button variant="secondary" disabled={!d.ready} onClick={() => { const o = duprFile(); download(`dupr-${s.date}.csv`, o.csv); }}><Download size={18} /></Button>
        </div>
        <p className="mt-2 text-xs text-ink-mute">Bilal uploads it on dupr.com: Club → Matches → Add Matches → Import Matches via CSV.</p>
      </Card>
      <Button variant="secondary" className="w-full" onClick={recap}><Copy size={17} />Copy recap for WhatsApp</Button>
    </>
  );
}

function IdRow({ id }) {
  const [v, setV] = useState('');
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 truncate text-sm">{nameOf(id)}</span>
      <input className="!w-32 !py-1.5 text-sm" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v && actions.savePlayer(id, 'dupr', v)} placeholder="DUPR ID" />
    </div>
  );
}

const PERIODS = [[28, '4 wks'], [56, '2 mo'], [182, '6 mo'], [0, 'All']];
const SORTS = [['pfg', 'Points'], ['diff', '+/-'], ['pct', 'Win %'], ['ppg', 'Court']];
const HEAD = { pfg: 'Pts/G', diff: '+/-', pct: 'Win%', ppg: 'Crt/G' };
const NOTE = {
  pfg: 'Average game points scored. Every point counts, even in a loss.',
  diff: 'Points scored minus allowed, per game.',
  pct: 'Share of games won.',
  ppg: 'Court points per game; wins on higher courts count more.',
};
const val = (x) => ({ pfg: x.pfg.toFixed(1), diff: (x.diff > 0 ? '+' : '') + x.diff.toFixed(1), pct: Math.round(x.pct * 100) + '%', ppg: x.ppg.toFixed(2) }[S.rankSort] || x.pfg.toFixed(1));

function Rankings() {
  const { list, minGames, nDays } = rankData();
  const ranked = list.filter((x) => x.qualified);
  const rest = list.filter((x) => !x.qualified);
  const podium = ranked.slice(0, 3);
  const label = { 28: 'last 4 weeks', 56: 'last 2 months', 182: 'last 6 months', 0: 'all time' }[S.rankPeriod];
  return (
    <Card>
      <div className="flex items-center justify-between"><Label>Rankings</Label><a href="rankings.html" className="flex items-center gap-1 text-xs font-semibold text-ink-soft">Public page <ExternalLink size={12} /></a></div>
      <Seg className="mt-3" value={S.rankPeriod} onChange={(v) => actions.rank('rankPeriod', v)} options={PERIODS} />
      <Seg className="mt-2" value={S.rankSort} onChange={(v) => actions.rank('rankSort', v)} options={SORTS} />
      {podium.length === 3 && (
        <div className="mt-5 grid grid-cols-3 items-end gap-2">
          {[1, 0, 2].map((i) => {
            const x = podium[i];
            const h = ['h-28', 'h-20', 'h-16'][i];
            return (
              <button key={x.id} onClick={() => setUI({ sheet: { type: 'card', id: x.id } })} className="flex flex-col items-center gap-1.5">
                <div className="relative"><Avatar name={nameOf(x.id)} size={i === 0 ? 56 : 46} />
                  <Medal size={20} className={cx('absolute -bottom-1 -right-1', ['text-gold', 'text-[#cfd6e4]', 'text-[#d79b6a]'][i])} fill="currentColor" /></div>
                <div className="max-w-full truncate text-sm font-extrabold">{firstName(x.id)}</div>
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className={cx('flex w-full flex-col items-center justify-start rounded-t-2xl pt-2', h, i === 0 ? 'bg-ball/20' : 'bg-night-700')}>
                  <div className={cx('text-lg font-black tnum', i === 0 && 'text-ball')}>{val(x)}</div>
                  <div className="text-[10px] font-bold text-ink-mute">{x.wins}-{x.games - x.wins}</div>
                </motion.div>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-3 divide-y divide-white/[.05]">
        {(podium.length === 3 ? ranked.slice(3) : ranked).concat(rest).map((x) => {
          const rank = ranked.indexOf(x);
          return (
            <button key={x.id} onClick={() => setUI({ sheet: { type: 'card', id: x.id } })} className={cx('grid w-full grid-cols-[30px_1fr_56px_52px_36px] items-center py-2 text-left', !x.qualified && 'opacity-45', x.id === S.me && 'text-ball')}>
              <span className="text-xs font-bold text-ink-mute tnum">{rank >= 0 ? rank + 1 : '·'}</span>
              <span className="truncate font-semibold">{nameOf(x.id)}</span>
              <span className="text-right font-black text-ball tnum">{val(x)}</span>
              <span className="text-right text-sm tnum">{x.wins}-{x.games - x.wins}</span>
              <span className="text-right text-xs text-ink-mute tnum">{x.days}d</span>
            </button>
          );
        })}
        {!list.length && <div className="py-6 text-center text-sm text-ink-mute">No games in this period yet.</div>}
      </div>
      <p className="mt-3 text-xs text-ink-mute">{nDays} sessions. {HEAD[S.rankSort]}: {NOTE[S.rankSort]} Needs {minGames}+ games to rank.</p>
      <Button variant="secondary" className="mt-3 w-full" onClick={() => copy(`🏆 P4A top 10, ${label} (${HEAD[S.rankSort]})\n` + ranked.slice(0, 10).map((x, i) => `${i + 1}. ${nameOf(x.id)}: ${val(x)}, ${x.wins}-${x.games - x.wins}`).join('\n'))}>
        <Copy size={17} />Copy top 10
      </Button>
    </Card>
  );
}

export default function Results() {
  useApp();
  return (
    <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-3"><Today /></div>
      <div className="space-y-3"><Rankings /></div>
    </div>
  );
}
