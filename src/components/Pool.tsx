import { useState } from 'react';
import type { Category, Equipment, Exercise } from '../types';

const CATEGORIES: Category[] = ['upper', 'lower', 'core', 'cardio'];
const EQUIPMENT: Equipment[] = ['bodyweight', 'dumbbells'];

export function Pool({ pool, setPool }: { pool: Exercise[]; setPool: (p: Exercise[]) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('upper');
  const [equipment, setEquipment] = useState<Equipment>('bodyweight');
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all');
  const [eqFilter, setEqFilter] = useState<Equipment | 'all'>('all');

  const update = (id: string, patch: Partial<Exercise>) =>
    setPool(pool.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const add = () => {
    if (!name.trim()) return;
    setPool([...pool, { id: crypto.randomUUID(), name: name.trim(), category, equipment }]);
    setName('');
  };

  const shown = pool.filter(
    (e) =>
      (catFilter === 'all' || e.category === catFilter) &&
      (eqFilter === 'all' || e.equipment === eqFilter),
  );

  const cyclePref = (e: Exercise) =>
    update(e.id, { pref: e.pref === undefined ? 'fav' : e.pref === 'fav' ? 'ban' : undefined });

  return (
    <section>
      <h2>Exercise pool ({pool.length})</h2>
      <div className="add-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New exercise name"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {EQUIPMENT.map((q) => <option key={q}>{q}</option>)}
        </select>
        <button onClick={add}>Add</button>
      </div>
      <div className="filters">
        Filter:
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as Category | 'all')}>
          <option value="all">all categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={eqFilter} onChange={(e) => setEqFilter(e.target.value as Equipment | 'all')}>
          <option value="all">all equipment</option>
          {EQUIPMENT.map((q) => <option key={q}>{q}</option>)}
        </select>
      </div>
      <ul className="pool-list">
        {shown.map((e) => (
          <li key={e.id}>
            <input value={e.name} onChange={(ev) => update(e.id, { name: ev.target.value })} />
            <select
              value={e.category}
              onChange={(ev) => update(e.id, { category: ev.target.value as Category })}
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select
              value={e.equipment}
              onChange={(ev) => update(e.id, { equipment: ev.target.value as Equipment })}
            >
              {EQUIPMENT.map((q) => <option key={q}>{q}</option>)}
            </select>
            <button
              className={`pref ${e.pref ?? 'none'}`}
              onClick={() => cyclePref(e)}
              title={
                e.pref === 'fav'
                  ? 'Favourite (picked more often) — click for ban'
                  : e.pref === 'ban'
                    ? 'Banned (never picked) — click to clear'
                    : 'Neutral — click to favourite'
              }
            >
              {e.pref === 'fav' ? '★' : e.pref === 'ban' ? '🚫' : '–'}
            </button>
            <input
              className="cue-input"
              value={e.cue ?? ''}
              onChange={(ev) => update(e.id, { cue: ev.target.value || undefined })}
              placeholder="Form cue"
            />
            <button onClick={() => setPool(pool.filter((x) => x.id !== e.id))} title="Delete">✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
