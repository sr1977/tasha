import type { Category, Equipment, Exercise } from './types';

const raw: [string, Category, Equipment][] = [
  ['Push-ups', 'upper', 'bodyweight'],
  ['Pike push-ups', 'upper', 'bodyweight'],
  ['Tricep dips', 'upper', 'bodyweight'],
  ['Inchworms', 'upper', 'bodyweight'],
  ['Shoulder press', 'upper', 'dumbbells'],
  ['Bent-over rows', 'upper', 'dumbbells'],
  ['Chest press', 'upper', 'dumbbells'],
  ['Bicep curls', 'upper', 'dumbbells'],
  ['Squats', 'lower', 'bodyweight'],
  ['Lunges', 'lower', 'bodyweight'],
  ['Glute bridges', 'lower', 'bodyweight'],
  ['Wall sit', 'lower', 'bodyweight'],
  ['Goblet squats', 'lower', 'dumbbells'],
  ['Dumbbell deadlifts', 'lower', 'dumbbells'],
  ['Weighted step-ups', 'lower', 'dumbbells'],
  ['Plank', 'core', 'bodyweight'],
  ['Sit-ups', 'core', 'bodyweight'],
  ['Russian twists', 'core', 'bodyweight'],
  ['Leg raises', 'core', 'bodyweight'],
  ['Bicycle crunches', 'core', 'bodyweight'],
  ['Burpees', 'cardio', 'bodyweight'],
  ['Mountain climbers', 'cardio', 'bodyweight'],
  ['High knees', 'cardio', 'bodyweight'],
  ['Jumping jacks', 'cardio', 'bodyweight'],
];

export const SEED_POOL: Exercise[] = raw.map(([name, category, equipment], i) => ({
  id: `seed-${i}`,
  name,
  category,
  equipment,
}));
