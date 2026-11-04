import { useEffect, useState, useSyncExternalStore } from 'react';
import { S, subscribe, getVersion, sess, curRound, roundDone, buzz, beep, toast } from './store.js';

export function useApp() { return useSyncExternalStore(subscribe, getVersion); }

// Round timer: ticks every second, buzzes at 1:00 and 0:00 on the Courts screen.
const warned = {};
export function useTimer() {
  const [, setNow] = useState(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const round = curRound();
  if (!round || !round.timed || roundDone(round) || !sess().id) return null;
  if (!round.timerEnd) return { idle: true };
  const left = Math.round((round.timerEnd - Date.now()) / 1000);
  const key = round.createdAt + ':' + round.timerEnd;
  if (S.ui.tab === 'play' || S.ui.display) {
    if (left <= 60 && left > 0 && !warned[key + 'w']) { warned[key + 'w'] = 1; buzz([200, 100, 200]); beep(1); }
    if (left <= 0 && !warned[key + 'u']) { warned[key + 'u'] = 1; buzz([400, 150, 400, 150, 400]); beep(3); toast('Time! Enter scores as they stand.'); }
  }
  const m = Math.floor(Math.abs(left) / 60), sec = String(Math.abs(left) % 60).padStart(2, '0');
  return { left, text: left <= 0 ? 'TIME' : `${m}:${sec}` };
}
