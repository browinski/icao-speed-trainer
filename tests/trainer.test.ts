import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALPHABET, accuracy, averageTime, createEmptyStats, createExerciseProgress, generateSequence,
  isCorrectAnswer, normalize, rankForXp, updateExerciseProgress, updateSequenceStats, xpReward,
} from '../app/trainer.ts';

test('contains all 26 letters and 10 ICAO digits', () => {
  assert.equal(ALPHABET.length, 36);
  assert.deepEqual(ALPHABET.slice(26).map((entry) => entry.word), ['Zero','Wun','Too','Tree','Fower','Fife','Six','Seven','Ait','Niner']);
});

test('normalizes alphanumeric sequences and accepts both answer directions', () => {
  assert.equal(normalize(' m-b 8 x '), 'MB8X');
  assert.equal(isCorrectAnswer('letter-to-word', 'niner', ALPHABET[35]), true);
  assert.equal(isCorrectAnswer('word-to-letter', '9', ALPHABET[35]), true);
});

test('keeps exercise statistics separate', () => {
  const initial = createExerciseProgress();
  const once = updateExerciseProgress(initial, 'letter-to-word', true, 1200);
  const twice = updateExerciseProgress(once, 'listen-to-sequence', false, 4000);
  assert.deepEqual(twice['letter-to-word'], { attempts: 1, correct: 1, streak: 1, bestStreak: 1, totalMs: 1200 });
  assert.deepEqual(twice['listen-to-sequence'], { attempts: 1, correct: 0, streak: 0, bestStreak: 0, totalMs: 4000 });
  assert.equal(twice['word-to-letter'].attempts, 0);
});

test('calculates accuracy and average response time per exercise', () => {
  const entry = { attempts: 4, correct: 3, streak: 2, bestStreak: 3, totalMs: 8000 };
  assert.equal(accuracy(entry), 75);
  assert.equal(averageTime(entry), 2000);
});

test('awards streak and sequence XP only for correct answers', () => {
  assert.equal(xpReward(false, 10, 'listen-to-sequence', 6), 0);
  assert.ok(xpReward(true, 9, 'listen-to-sequence', 5) > xpReward(true, 1, 'letter-to-word', 3));
});

test('moves the learner through aviation ranks', () => {
  assert.equal(rankForXp(0).title, 'Kadet');
  assert.equal(rankForXp(650).title, 'Pierwszy oficer');
  assert.equal(rankForXp(9999).title, 'Dowódca eskadry');
});

test('generates sequences and scores each character adaptively', () => {
  assert.equal(generateSequence(createEmptyStats(), 5, () => 0.5).length, 5);
  const updated = updateSequenceStats(createEmptyStats(), [0, 1, 2], 'AXC', 3000);
  assert.equal(updated[0].errors, 0); assert.equal(updated[1].errors, 1); assert.equal(updated[2].errors, 0);
});
