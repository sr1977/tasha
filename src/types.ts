export type Category = 'upper' | 'lower' | 'core';
// Anything that isn't bodyweight is shared kit: the household owns one set, so
// the generator never runs two stations needing the same kind at once.
export type Equipment = 'bodyweight' | 'dumbbells' | 'medicine ball';

export type Pref = 'fav' | 'ban';

export interface Exercise {
  id: string;
  name: string;
  category: Category;
  equipment: Equipment;
  pref?: Pref;
  /** Headline form cue — shown on screen and read out with "next up". */
  cue?: string;
  /** Extra form cues; mid-set form callouts draw from [cue, ...cues]. */
  cues?: string[];
}

export interface PartnerConfig {
  on: boolean;
  /** groups[i] = people assigned to group i; length is the group count (1–4). */
  groups: string[][];
}

export interface Settings {
  workSecs: number;
  restSecs: number;
  stations: number;
  roundRestSecs: number;
  totalMins: number;
  /** Number of distinct round layouts that cycle across rounds (1 = every round identical). */
  distinctRounds?: number;
  /** 0–1: chance the late-set callout is a drill-sergeant jab instead of encouragement. */
  nasty?: number;
  /** Categories the work stations draw from. Undefined, empty or all = everything. */
  focus?: Category[];
  partner?: PartnerConfig;
  /** All known people, assigned or not. */
  roster?: string[];
}

export const DEFAULT_ROSTER = ['Steve', 'Rebecca', 'Kathleen', 'Silki', 'Stew', 'Carl', 'Johnny'];

export const DEFAULT_SETTINGS: Settings = {
  workSecs: 40,
  restSecs: 20,
  stations: 6,
  roundRestSecs: 60,
  totalMins: 45,
  distinctRounds: 2,
  nasty: 0.25,
  partner: {
    on: true,
    groups: [
      ['Steve', 'Rebecca'],
      ['Kathleen', 'Silki', 'Stew'],
    ],
  },
  roster: DEFAULT_ROSTER,
};

export type IntervalKind = 'prep' | 'warmup' | 'work' | 'rest' | 'roundRest' | 'cooldown';

export interface SessionInterval {
  kind: IntervalKind;
  /** The exercise to do (work) or the upcoming exercise (rest/roundRest). */
  exercise?: Exercise;
  duration: number; // seconds
  round: number; // 1-based
  station: number; // 1-based; 0 for prep/roundRest
}

export type Session = SessionInterval[];
