export type Mode = 'letter-to-word' | 'word-to-letter' | 'listen-to-letter' | 'listen-to-sequence';
export type AlphabetEntry = { letter: string; word: string };
export type LetterStats = { attempts: number; errors: number; avgMs: number };
export type ExerciseStats = { attempts: number; correct: number; streak: number; bestStreak: number; totalMs: number };
export type ExerciseProgress = Record<Mode, ExerciseStats>;

export const ALPHABET: AlphabetEntry[] = [
  { letter: 'A', word: 'Alfa' }, { letter: 'B', word: 'Bravo' }, { letter: 'C', word: 'Charlie' },
  { letter: 'D', word: 'Delta' }, { letter: 'E', word: 'Echo' }, { letter: 'F', word: 'Foxtrot' },
  { letter: 'G', word: 'Golf' }, { letter: 'H', word: 'Hotel' }, { letter: 'I', word: 'India' },
  { letter: 'J', word: 'Juliett' }, { letter: 'K', word: 'Kilo' }, { letter: 'L', word: 'Lima' },
  { letter: 'M', word: 'Mike' }, { letter: 'N', word: 'November' }, { letter: 'O', word: 'Oscar' },
  { letter: 'P', word: 'Papa' }, { letter: 'Q', word: 'Quebec' }, { letter: 'R', word: 'Romeo' },
  { letter: 'S', word: 'Sierra' }, { letter: 'T', word: 'Tango' }, { letter: 'U', word: 'Uniform' },
  { letter: 'V', word: 'Victor' }, { letter: 'W', word: 'Whiskey' }, { letter: 'X', word: 'X-ray' },
  { letter: 'Y', word: 'Yankee' }, { letter: 'Z', word: 'Zulu' },
  { letter: '0', word: 'Zero' }, { letter: '1', word: 'Wun' }, { letter: '2', word: 'Too' },
  { letter: '3', word: 'Tree' }, { letter: '4', word: 'Fower' }, { letter: '5', word: 'Fife' },
  { letter: '6', word: 'Six' }, { letter: '7', word: 'Seven' }, { letter: '8', word: 'Ait' },
  { letter: '9', word: 'Niner' },
];

export const MODES: Array<{ id: Mode; label: string; shortLabel: string; description: string; icon: string }> = [
  { id: 'letter-to-word', label: 'Znak → ICAO', shortLabel: 'Kodowanie', description: 'wpisz słowo kodowe', icon: 'A' },
  { id: 'word-to-letter', label: 'ICAO → Znak', shortLabel: 'Dekodowanie', description: 'rozpoznaj znak', icon: 'Aa' },
  { id: 'listen-to-letter', label: 'Słuch → Znak', shortLabel: 'Nasłuch', description: 'jeden znak ze słuchu', icon: '▶' },
  { id: 'listen-to-sequence', label: 'Sekwencja', shortLabel: 'Depesza', description: 'kilka znaków pod rząd', icon: 'A3' },
];

const EMPTY_EXERCISE: ExerciseStats = { attempts: 0, correct: 0, streak: 0, bestStreak: 0, totalMs: 0 };

export const createEmptyStats = (): LetterStats[] => ALPHABET.map(() => ({ attempts: 0, errors: 0, avgMs: 0 }));
export const createExerciseProgress = (): ExerciseProgress => ({
  'letter-to-word': { ...EMPTY_EXERCISE }, 'word-to-letter': { ...EMPTY_EXERCISE },
  'listen-to-letter': { ...EMPTY_EXERCISE }, 'listen-to-sequence': { ...EMPTY_EXERCISE },
});
export const normalize = (value: string): string => value.trim().toLocaleUpperCase('en-US').replace(/[^A-Z0-9]/g, '');
export const isCorrectAnswer = (mode: Mode, answer: string, entry: AlphabetEntry): boolean => normalize(answer) === normalize(mode === 'letter-to-word' ? entry.word : entry.letter);
export const accuracy = (entry: ExerciseStats): number => entry.attempts ? Math.round((entry.correct / entry.attempts) * 100) : 0;
export const averageTime = (entry: ExerciseStats): number => entry.attempts ? entry.totalMs / entry.attempts : 0;

export function updateExerciseProgress(progress: ExerciseProgress, mode: Mode, correct: boolean, elapsedMs: number): ExerciseProgress {
  const current = progress[mode];
  const streak = correct ? current.streak + 1 : 0;
  return { ...progress, [mode]: { attempts: current.attempts + 1, correct: current.correct + (correct ? 1 : 0), streak, bestStreak: Math.max(current.bestStreak, streak), totalMs: current.totalMs + elapsedMs } };
}

export function xpReward(correct: boolean, resultingStreak: number, mode: Mode, sequenceLength: number): number {
  if (!correct) return 0;
  return 10 + Math.min(10, Math.floor(resultingStreak / 3) * 2) + (mode === 'listen-to-sequence' ? sequenceLength * 2 : 0);
}

const RANKS = [
  { title: 'Kadet', min: 0 }, { title: 'Radiooperator', min: 120 }, { title: 'Drugi pilot', min: 300 },
  { title: 'Pierwszy oficer', min: 650 }, { title: 'Kapitan', min: 1200 }, { title: 'Dowódca eskadry', min: 2200 },
];

export function rankForXp(xp: number) {
  const index = Math.max(0, RANKS.findLastIndex((rank) => xp >= rank.min));
  const current = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const progress = next ? Math.round(((xp - current.min) / (next.min - current.min)) * 100) : 100;
  return { ...current, nextTitle: next?.title ?? 'Maksymalny stopień', nextAt: next?.min ?? current.min, progress: Math.max(0, Math.min(100, progress)) };
}

export function updateLetterStats(stats: LetterStats[], index: number, correct: boolean, elapsedMs: number): LetterStats[] {
  return stats.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    const attempts = entry.attempts + 1;
    const avgMs = entry.attempts === 0 ? elapsedMs : ((entry.avgMs * entry.attempts) + elapsedMs) / attempts;
    return { attempts, errors: entry.errors + (correct ? 0 : 1), avgMs };
  });
}

export function itemWeight(entry: LetterStats): number {
  return 1 + (entry.attempts === 0 ? 1.6 : 0) + entry.errors * 2.5 + Math.min(3, Math.max(0, entry.avgMs - 1800) / 1100);
}

export function pickWeightedIndex(stats: LetterStats[], previousIndex: number, random = Math.random): number {
  const weights = stats.map((entry, index) => index === previousIndex ? itemWeight(entry) * 0.15 : itemWeight(entry));
  let target = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < weights.length; index += 1) { target -= weights[index]; if (target <= 0) return index; }
  return weights.length - 1;
}

export function generateSequence(stats: LetterStats[], length: number, random = Math.random): number[] {
  const result: number[] = [];
  for (let position = 0; position < length; position += 1) result.push(pickWeightedIndex(stats, result.at(-1) ?? -1, random));
  return result;
}

export function updateSequenceStats(stats: LetterStats[], sequence: number[], answer: string, elapsedMs: number): LetterStats[] {
  const typed = normalize(answer);
  const perCharacterMs = elapsedMs / Math.max(1, sequence.length);
  return sequence.reduce((nextStats, alphabetIndex, position) => updateLetterStats(nextStats, alphabetIndex, typed[position] === ALPHABET[alphabetIndex].letter, perCharacterMs), stats);
}
