import { useState } from 'react';
import { Plus, Trash2, ChevronDown, Wifi, WifiOff, CalendarPlus } from 'lucide-react';
import { S, sess, rosterList, hasRating, sessionList, nextSaturday, niceDate, createSession, openSession, actions, toast, blank } from '../lib/store.js';
import { useApp } from '../lib/hooks.js';
import { Card, Label, Button, Seg, Pill, cx } from '../ui/kit.jsx';

function Players() {
  const list = rosterList();
  const [paste, setPaste] = useState('');
  const [q, setQ] = useState('');
  const [armed, setArmed] = useState(null);
  const shown = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const missR = list.filter((p) => !hasRating(p.id)).length, missD = list.filter((p) => !p.dupr).length;
  return (
    <Card>
      <div className="flex items-center justify-between"><Label>Players · {list.length}</Label>
        <div className="flex gap-1">{missR > 0 && <Pill tone="amber">{missR} no rating</Pill>}{missD > 0 && <Pill tone="amber">{missD} no DUPR ID</Pill>}</div></div>
      <p className="mt-1 text-xs text-ink-mute">Ratings set the courts (court 1 = highest). Changes save for everyone when you leave a field.</p>
      <input className="mt-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" />
      <div className="mt-3 grid grid-cols-[1fr_72px_96px_28px] gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-mute"><span>Name</span><span>Rating</span><span>DUPR ID</span><span /></div>
      <div className="mt-1 space-y-1.5">
        {shown.map((p) => (
          <div key={p.id} className="grid grid-cols-[1fr_72px_96px_28px] items-center gap-1.5">
            <input defaultValue={p.name} className="!py-2 text-[15px]" onBlur={(e) => e.target.value !== p.name && actions.savePlayer(p.id, 'name', e.target.value)} />
            <input defaultValue={blank(p.rating) ? '' : p.rating} inputMode="decimal" placeholder="3.50" className="!py-2 text-[15px] tnum" onBlur={(e) => String(e.target.value) !== String(p.rating ?? '') && actions.savePlayer(p.id, 'rating', e.target.value)} />
            <input defaultValue={p.dupr || ''} placeholder="ID" className="!py-2 text-[15px]" onBlur={(e) => e.target.value !== (p.dupr || '') && actions.savePlayer(p.id, 'dupr', e.target.value)} />
            <button onClick={() => (armed === p.id ? (actions.deletePlayer(p.id), setArmed(null)) : setArmed(p.id))} className={cx('grid h-8 w-7 place-items-center rounded-lg', armed === p.id ? 'bg-rose text-white' : 'text-ink-mute')}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-ink-mute"><Plus size={14} />Paste names with ratings<ChevronDown size={14} className="transition group-open:rotate-180" /></summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} className="mt-2 min-h-[100px]" placeholder={'Bilal Majeed 3.4\nAhmed Irfan 3.64'} />
        <Button variant="secondary" className="mt-2 w-full" onClick={() => { actions.pasteRoster(paste); setPaste(''); }}>Add or update players</Button>
      </details>
    </Card>
  );
}

function Sessions() {
  const [date, setDate] = useState(nextSaturday());
  const [time, setTime] = useState(S.settings.time);
  const list = sessionList();
  return (
    <>
      <Card>
        <Label>New session</Label>
        <div className="mt-3 flex gap-2"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><input value={time} onChange={(e) => setTime(e.target.value)} className="!w-32" /></div>
        <Button className="mt-3 w-full" onClick={() => { createSession(date, time); toast('Session created for ' + niceDate(date)); actions.setTab('signup'); }}><CalendarPlus size={18} />Create session</Button>
      </Card>
      <Card>
        <Label>All sessions · {list.length}</Label>
        <div className="mt-2 divide-y divide-white/[.05]">
          {list.map((x) => {
            const ins = Object.values(x.rsvp).filter((v) => v && v.s === 'in').length;
            return (
              <div key={x.id} className="flex items-center justify-between py-3">
                <div><div className="font-bold">{niceDate(x.date)} <span className="text-sm font-normal text-ink-mute">{x.time}</span></div>
                  <div className="text-xs text-ink-mute">{ins} signed up · {x.rounds.length} rounds</div></div>
                {x.id === sess().id ? <Pill>Open</Pill> : <Button variant="secondary" size="sm" onClick={() => { openSession(x.id); toast('Opened ' + niceDate(x.date)); }}>Open</Button>}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-mute">Plus {Object.keys(S.history || {}).length} past Saturdays imported from Pickleheads, counted in rankings.</p>
      </Card>
    </>
  );
}

function Settings() {
  const st = S.settings;
  const set = (k) => (v) => actions.setSetting(k, v);
  const Row = ({ label, children, hint }) => <div className="mb-4 last:mb-0"><div className="mb-1.5 text-[13px] font-semibold text-ink-soft">{label}</div>{children}{hint && <div className="mt-1.5 text-xs text-ink-mute">{hint}</div>}</div>;
  return (
    <>
      <p className="px-1 text-xs text-ink-mute">Settings are shared by the whole group.</p>
      <Card>
        <Label className="mb-3">Games</Label>
        <Row label="Play to"><Seg value={st.target} onChange={set('target')} options={[[11, '11'], [15, '15'], [21, '21']]} /></Row>
        <Row label="Win by"><Seg value={st.winBy} onChange={set('winBy')} options={[[1, '1'], [2, '2']]} /></Row>
        <Row label="Scoring"><Seg value={st.scoreType} onChange={set('scoreType')} options={[['SIDEOUT', 'Side-out'], ['RALLY', 'Rally']]} /></Row>
        <Row label="Rounds in a morning" hint="Used for sit-out estimates."><Seg value={st.rounds} onChange={set('rounds')} options={[[6, '6'], [7, '7'], [8, '8'], [9, '9'], [10, '10']]} /></Row>
      </Card>
      <Card>
        <Label className="mb-3">Round timer</Label>
        <Row label="Minutes per round"><Seg value={st.timerMin} onChange={set('timerMin')} options={[[0, 'Off'], [8, '8'], [10, '10'], [12, '12'], [15, '15']]} /></Row>
        <Row label="Start the timer" hint="Buzzes at 1 minute left and at time. Timed games can end below the target."><Seg value={st.timerAuto} onChange={set('timerAuto')} options={[[true, 'Automatically'], [false, 'When I tap']]} /></Row>
      </Card>
      <Card>
        <Label className="mb-3">Courts</Label>
        <Row label="Placement"><Seg value={st.mode} onChange={set('mode')} options={[['rating', 'By rating'], ['ladder', 'Up & down ladder']]} /></Row>
        <Row label="Court variety" hint="Mixes similar-rated players across neighboring courts. Nobody moves more than one court from where they just played; winners lean up, losers lean down.">
          <Seg value={st.mixGap} onChange={set('mixGap')} options={[[0, 'Off'], [0.15, 'Light'], [0.3, 'Normal'], [0.45, 'More']]} /></Row>
        <Row label="Protect winners from sitting" hint="Sit-outs stay equal (nobody sits twice until everyone has sat once, never twice in a row). Among those due to sit, losers sit first.">
          <Seg value={st.protectWinners} onChange={set('protectWinners')} options={[[true, 'On'], [false, 'Off']]} /></Row>
        <Row label="Hot-streak nudge (rating per net win today)"><input defaultValue={st.formBump} inputMode="decimal" onBlur={(e) => !isNaN(+e.target.value) && actions.setSetting('formBump', +e.target.value)} /></Row>
        <Row label="Rating for players without one"><input defaultValue={st.defaultRating} inputMode="decimal" onBlur={(e) => !isNaN(+e.target.value) && actions.setSetting('defaultRating', +e.target.value)} /></Row>
      </Card>
      <Card>
        <Label className="mb-3">Sessions & DUPR file</Label>
        <Row label="Default start time"><input defaultValue={st.time} onBlur={(e) => actions.setSetting('time', e.target.value)} /></Row>
        <Row label="Event name"><input defaultValue={st.event} onBlur={(e) => actions.setSetting('event', e.target.value)} /></Row>
        <Row label="Location"><input defaultValue={st.location} onBlur={(e) => actions.setSetting('location', e.target.value)} /></Row>
      </Card>
      <Card className="flex items-center gap-3">
        {S.online ? <Wifi className="text-teal" /> : <WifiOff className="text-amber" />}
        <div className="text-sm text-ink-soft">{S.online ? 'Live: changes sync to every phone instantly.' : 'Offline: changes are saved on this phone and sync when you reconnect.'}</div>
      </Card>
    </>
  );
}

export default function More() {
  useApp();
  const t = S.ui.moreTab;
  return (
    <div className="space-y-3">
      <Seg className="lg:max-w-md" value={t} onChange={(v) => { S.ui.moreTab = v; actions.setTab('more'); }} options={[['players', 'Players'], ['sessions', 'Sessions'], ['settings', 'Settings']]} />
      <div className={cx(t !== 'players' && 'space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0 [&>*]:lg:mb-0', t === 'players' && 'lg:max-w-3xl')}>
        {t === 'sessions' ? <Sessions /> : t === 'settings' ? <Settings /> : <Players />}
      </div>
    </div>
  );
}
