import type { Category, Equipment, Exercise } from './types';

// Each exercise carries a list of form cues: the first is the headline cue
// (shown on screen, read with "next up"), the rest feed mid-set form callouts.
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
];

export const SEED_POOL: Exercise[] = raw.map(([name, category, equipment, cues], i) => ({
  id: `seed-${i}`,
  name,
  category,
  equipment,
  cue: cues[0],
  cues: cues.slice(1),
}));
