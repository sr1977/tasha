export type Category = 'upper' | 'lower' | 'core' | 'cardio';
export type Equipment = 'bodyweight' | 'dumbbells';

export type Pref = 'fav' | 'ban';

export interface Exercise {
  id: string;
  name: string;
  category: Category;
  equipment: Equipment;
  pref?: Pref;
  cue?: string;
}

export interface PartnerConfig {
  on: boolean;
  names: string[];
}

export interface Settings {
  workSecs: number;
  restSecs: number;
  stations: number;
  roundRestSecs: number;
  totalMins: number;
  partner?: PartnerConfig;
}

export const DEFAULT_SETTINGS: Settings = {
  workSecs: 40,
  restSecs: 20,
  stations: 6,
  roundRestSecs: 60,
  totalMins: 45,
};

export type IntervalKind = 'prep' | 'work' | 'rest' | 'roundRest';

export interface SessionInterval {
  kind: IntervalKind;
  /** The exercise to do (work) or the upcoming exercise (rest/roundRest). */
  exercise?: Exercise;
  duration: number; // seconds
  round: number; // 1-based
  station: number; // 1-based; 0 for prep/roundRest
}

export type Session = SessionInterval[];
