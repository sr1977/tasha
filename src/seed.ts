import type { Category, Equipment, Exercise } from './types';

const raw: [string, Category, Equipment, string][] = [
  ['Push-ups', 'upper', 'bodyweight', 'keep your body in a straight line'],
  ['Pike push-ups', 'upper', 'bodyweight', 'hips high, head toward the floor'],
  ['Tricep dips', 'upper', 'bodyweight', 'elbows point straight back'],
  ['Inchworms', 'upper', 'bodyweight', 'walk the hands out slowly, legs straight'],
  ['Shoulder press', 'upper', 'dumbbells', "don't arch your lower back"],
  ['Bent-over rows', 'upper', 'dumbbells', 'squeeze the shoulder blades'],
  ['Chest press', 'upper', 'dumbbells', 'wrists stacked over elbows'],
  ['Bicep curls', 'upper', 'dumbbells', 'elbows pinned to your sides'],
  ['Squats', 'lower', 'bodyweight', 'drive through the heels'],
  ['Lunges', 'lower', 'bodyweight', 'front knee over the ankle'],
  ['Glute bridges', 'lower', 'bodyweight', 'squeeze at the top'],
  ['Wall sit', 'lower', 'bodyweight', 'thighs parallel to the floor'],
  ['Goblet squats', 'lower', 'dumbbells', 'chest up, elbows inside the knees'],
  ['Dumbbell deadlifts', 'lower', 'dumbbells', 'flat back, hinge at the hips'],
  ['Weighted step-ups', 'lower', 'dumbbells', 'push through the top foot'],
  ['Plank', 'core', 'bodyweight', "don't let the hips sag"],
  ['Sit-ups', 'core', 'bodyweight', 'chin off your chest'],
  ['Russian twists', 'core', 'bodyweight', 'rotate from the torso'],
  ['Leg raises', 'core', 'bodyweight', 'press your lower back into the floor'],
  ['Bicycle crunches', 'core', 'bodyweight', 'slow and controlled'],
  ['Plank ball pull-throughs', 'core', 'medicine ball', 'hips level — drag it through with the opposite hand'],
  ['Standing ball twists', 'core', 'medicine ball', 'arms long, rotate from the waist not the arms'],
];

export const SEED_POOL: Exercise[] = raw.map(([name, category, equipment, cue], i) => ({
  id: `seed-${i}`,
  name,
  category,
  equipment,
  cue,
}));
