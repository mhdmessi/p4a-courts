import { motion } from 'framer-motion';
import { S } from '../lib/store.js';

export default function Loading() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-ink-soft">
      <motion.img src="icon.svg" alt="" className="h-14 w-14" animate={{ y: [0, -14, 0] }} transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut' }} />
      {S.online ? 'Loading…' : 'Offline. Connect to load the group.'}
    </div>
  );
}
