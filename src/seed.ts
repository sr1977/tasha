import type { Category, Equipment, Exercise } from './types';

// Each exercise carries a list of form cues: the first is the headline cue
// (shown on screen, read with "next up"), the rest feed mid-set form callouts.
// Every cue is a mid-exercise reminder — a short correction you'd shout at
// someone already doing the move — never a how-to instruction.
const raw: [string, Category, Equipment, string[]][] = [
  ['Push-ups', 'upper', 'bodyweight', [
    'keep your body in a straight line',
    'elbows tucked, not flared',
    'chest all the way to the floor',
    'squeeze your glutes to hold the plank',
  ]],
  ['Pike push-ups', 'upper', 'bodyweight', [
    'hips high, head toward the floor',
    'crown of the head to the mat',
    'keep the elbows tracking back',
    'press the heels down as you push',
  ]],
  ['Tricep dips', 'upper', 'bodyweight', [
    'elbows point straight back',
    'shoulders down, away from the ears',
    'chest up — no slumping',
    'full lockout at the top',
  ]],
  ['Inchworms', 'upper', 'bodyweight', [
    'walk the hands out slowly, legs straight',
    'reach as far out as you can hold',
    'keep the core tight all the way out',
    'heels pressing toward the floor',
  ]],
  ['Shoulder press', 'upper', 'dumbbells', [
    "don't arch your lower back",
    'ribs down, core braced',
    'press to a full lockout',
    'wrists stacked over the elbows',
  ]],
  ['Bent-over rows', 'upper', 'dumbbells', [
    'squeeze the shoulder blades',
    'flat back, hinge from the hips',
    'pull the elbows past the ribs',
    'control the weight — no jerking',
  ]],
  ['Chest press', 'upper', 'dumbbells', [
    'wrists stacked over elbows',
    'drive the weights together at the top',
    'shoulder blades pinned back',
    'slow on the way down',
  ]],
  ['Bicep curls', 'upper', 'dumbbells', [
    'elbows pinned to your sides',
    'strict reps — no swinging',
    'squeeze hard at the top',
    'lower for a slow count',
  ]],
  ['Squats', 'lower', 'bodyweight', [
    'drive through the heels',
    'chest proud, eyes forward',
    'knees track over the toes',
    'sit the hips back and down',
  ]],
  ['Lunges', 'lower', 'bodyweight', [
    'front knee over the ankle',
    'back knee kisses the floor',
    'torso tall — no leaning',
    'push off through the front heel',
  ]],
  ['Glute bridges', 'lower', 'bodyweight', [
    'squeeze at the top',
    'drive the hips to the ceiling',
    'heels close to your hips',
    'ribs down — no back arch',
  ]],
  ['Wall sit', 'lower', 'bodyweight', [
    'thighs parallel to the floor',
    'back flat against the wall',
    'weight through the heels',
    'hands off the thighs',
  ]],
  ['Goblet squats', 'lower', 'dumbbells', [
    'chest up, elbows inside the knees',
    'sit down between the heels',
    'keep the weight tight to your chest',
    'stand tall and squeeze at the top',
  ]],
  ['Dumbbell deadlifts', 'lower', 'dumbbells', [
    'flat back, hinge at the hips',
    'push the hips back, not down',
    'keep the weights close to your legs',
    'squeeze the glutes to stand tall',
  ]],
  ['Weighted step-ups', 'lower', 'dumbbells', [
    'push through the top foot',
    'stand all the way up at the top',
    'control the step back down',
    'no pushing off the back leg',
  ]],
  ['Plank', 'core', 'bodyweight', [
    "don't let the hips sag",
    'one straight line, head to heels',
    'squeeze the glutes and brace',
    "keep breathing — don't hold it",
  ]],
  ['Sit-ups', 'core', 'bodyweight', [
    'chin off your chest',
    'control the way back down',
    'reach tall at the top',
    'no pulling on the neck',
  ]],
  ['Russian twists', 'core', 'bodyweight', [
    'rotate from the torso',
    'chest open, back straight',
    'touch the floor each side',
    'slow and controlled — no flailing',
  ]],
  ['Leg raises', 'core', 'bodyweight', [
    'press your lower back into the floor',
    'keep the legs as straight as you can',
    'lower slowly — no dropping',
    'toes up to the ceiling',
  ]],
  ['Bicycle crunches', 'core', 'bodyweight', [
    'slow and controlled',
    'elbow to the opposite knee',
    'shoulders off the floor',
    'long legs — full extension',
  ]],
  ['Plank ball pull-throughs', 'core', 'medicine ball', [
    'hips level — drag it through with the opposite hand',
    'wide feet for a stable base',
    "don't let the hips swing",
    'reach far, pull it through smooth',
  ]],
  ['Standing ball twists', 'core', 'medicine ball', [
    'arms long, rotate from the waist not the arms',
    'hips face forward, twist the ribs',
    'controlled power — no throwing it around',
    'breathe out on every twist',
  ]],
  ['RDL', 'lower', 'dumbbells', [
    'hinge at the hips — flat back, weights brushing your legs',
    'soft knees — hinge, not squat',
    'push the hips back, feel the hamstrings',
    'drive the hips through at the top',
  ]],
  ['Wide push-ups', 'upper', 'bodyweight', [
    'hands wide, chest all the way to the floor',
    'body in one straight line',
    'elbows stacked over the wrists',
    'full lockout at the top',
  ]],
  ['Mountain climbers', 'core', 'bodyweight', [
    'drive the knees fast, hips down',
    'shoulders stacked over the wrists',
    'quick feet — like the floor is hot',
    'core braced — no bouncing hips',
  ]],
  ['Hollow hold', 'core', 'bodyweight', [
    'lower back glued to the floor',
    'arms and legs long and lifted',
    'ribs down, squeeze the middle',
    "breathe — don't hold your breath",
  ]],
  ['Ball squat to press', 'lower', 'medicine ball', [
    'squat deep, punch the ball to the ceiling',
    'drive through the heels into the press',
    'chest up, ball tight on the way down',
    'one flowing move — no pausing halfway',
  ]],
  ['Plank shoulder taps', 'core', 'bodyweight', [
    'hips dead still — tap, don\'t tip',
    'wide feet for a solid base',
    'squeeze the floor with the planted hand',
    'slow taps beat fast wobbles',
  ]],
  ['Renegade rows', 'upper', 'dumbbells', [
    'row from a rock-solid plank — hips square',
    'pull the elbow past the ribs',
    'push the floor away with the other hand',
    'wide feet — no rocking',
  ]],
];

// Retired defaults. Ids are positional, so raw entries must never be deleted
// or reordered — retired ones are filtered out AFTER ids are assigned, and
// purged from saved pools on load (same treatment as the old cardio category).
export const RETIRED_SEED_IDS = new Set([
  'seed-1', // Pike push-ups
  'seed-13', // Dumbbell deadlifts
  'seed-14', // Weighted step-ups
]);

const ALL_SEEDS: Exercise[] = raw.map(([name, category, equipment, cues], i) => ({
  id: `seed-${i}`,
  name,
  category,
  equipment,
  cue: cues[0],
  cues: cues.slice(1),
}));

export const SEED_POOL: Exercise[] = ALL_SEEDS.filter((e) => !RETIRED_SEED_IDS.has(e.id));

/** Seed-mark units: raw entries ever offered, retired ones included. */
export const SEED_RAW_COUNT = raw.length;

/** Seed exercises added after `mark`, minus the retired ones. */
export function seedAdditionsSince(mark: number): Exercise[] {
  return ALL_SEEDS.slice(mark).filter((e) => !RETIRED_SEED_IDS.has(e.id));
}
