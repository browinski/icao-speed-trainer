'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALPHABET, MODES, accuracy, averageTime, type ExerciseProgress, type LetterStats, type Mode,
  createEmptyStats, createExerciseProgress, generateSequence, isCorrectAnswer, normalize,
  pickWeightedIndex, rankForXp, updateExerciseProgress, updateLetterStats, updateSequenceStats, xpReward,
} from './trainer';

const STORAGE_KEY = 'icao-speed-trainer-progress-v4';
const VOICE_KEY = 'icao-speed-trainer-voice-v1';
const DAILY_GOAL = 20;

function accentLabel(language: string) {
  const labels: Record<string, string> = {
    'en-US': 'angielski · USA',
    'en-GB': 'angielski · Wielka Brytania',
    'en-AU': 'angielski · Australia',
    'en-CA': 'angielski · Kanada',
    'en-IE': 'angielski · Irlandia',
    'en-IN': 'angielski · Indie',
    'en-NZ': 'angielski · Nowa Zelandia',
    'en-ZA': 'angielski · RPA',
  };
  return labels[language] ?? language.replace('-', ' · ');
}
const FLIGHT_PHASES = ['Kołowanie', 'Start', 'Wznoszenie', 'Przelot', 'Misja wykonana'];

export default function Home() {
  const [mode, setMode] = useState<Mode>('letter-to-word');
  const [index, setIndex] = useState(0);
  const [sequenceLength, setSequenceLength] = useState(3);
  const [sequence, setSequence] = useState<number[]>([0, 1, 2]);
  const [answer, setAnswer] = useState('');
  const [letterStats, setLetterStats] = useState<LetterStats[]>(createEmptyStats);
  const [exerciseProgress, setExerciseProgress] = useState<ExerciseProgress>(createExerciseProgress);
  const [xp, setXp] = useState(0);
  const [flightCorrect, setFlightCorrect] = useState(0);
  const [lastTime, setLastTime] = useState<number | null>(null);
  const [reward, setReward] = useState(0);
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const [speechProblem, setSpeechProblem] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceChoice, setVoiceChoice] = useState('rotate');
  const [activeVoiceName, setActiveVoiceName] = useState('Głos systemowy');
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const voiceChoiceRef = useRef('rotate');
  const activeVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const lastVoiceUriRef = useRef('');
  const startedAt = useRef(0);
  const nextTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const item = ALPHABET[index];
  const expectedSequence = sequence.map((entryIndex) => ALPHABET[entryIndex].letter).join('');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem('icao-speed-trainer-progress-v3') || window.localStorage.getItem('icao-speed-trainer-progress-v2');
      if (!saved) return;
      const parsed = JSON.parse(saved);
      const migratedStats = createEmptyStats();
      if (Array.isArray(parsed.stats)) parsed.stats.slice(0, ALPHABET.length).forEach((entry: LetterStats, entryIndex: number) => { migratedStats[entryIndex] = entry; });
      const migratedProgress = parsed.exerciseProgress ?? createExerciseProgress();
      const migratedXp = parsed.xp ?? ((parsed.correctCount ?? 0) * 10);
      queueMicrotask(() => { setLetterStats(migratedStats); setExerciseProgress(migratedProgress); setXp(migratedXp); });
    } catch { /* Training still works if local storage is unavailable. */ }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ stats: letterStats, exerciseProgress, xp })); } catch { /* Keep state in memory. */ }
  }, [letterStats, exerciseProgress, xp]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    try {
      const savedChoice = window.localStorage.getItem(VOICE_KEY) || 'rotate';
      voiceChoiceRef.current = savedChoice;
      queueMicrotask(() => setVoiceChoice(savedChoice));
    } catch { /* Use automatic rotation when preferences are unavailable. */ }

    const loadVoices = () => {
      const installed = window.speechSynthesis.getVoices();
      const englishVoices = installed.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
      const available = englishVoices.length ? englishVoices : installed;
      voicesRef.current = available;
      setVoices(available);
    };

    queueMicrotask(loadVoices);
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const speakWords = useCallback((words: string[], newQuestion = false) => {
    if (!('speechSynthesis' in window)) { setSpeechProblem('Ta przeglądarka nie obsługuje syntezy mowy. Pozostałe tryby nadal działają.'); return; }
    setSpeechProblem(''); window.speechSynthesis.cancel();

    const available = voicesRef.current;
    let selectedVoice = activeVoiceRef.current;
    if (voiceChoiceRef.current !== 'rotate') {
      selectedVoice = available.find((voice) => voice.voiceURI === voiceChoiceRef.current) ?? available[0] ?? null;
    } else if (newQuestion || !selectedVoice) {
      const freshVoices = available.filter((voice) => voice.voiceURI !== lastVoiceUriRef.current);
      const pool = freshVoices.length ? freshVoices : available;
      selectedVoice = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }

    activeVoiceRef.current = selectedVoice;
    if (selectedVoice) {
      lastVoiceUriRef.current = selectedVoice.voiceURI;
      setActiveVoiceName(`${selectedVoice.name} · ${accentLabel(selectedVoice.lang)}`);
    } else {
      setActiveVoiceName('Głos systemowy');
    }

    const utterance = new SpeechSynthesisUtterance(words.join('. '));
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.lang = selectedVoice?.lang || 'en-US'; utterance.rate = words.length > 1 ? 0.68 : 0.82; utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    startedAt.current = performance.now(); inputRef.current?.focus();
    if (mode === 'listen-to-letter' || mode === 'listen-to-sequence') {
      const words = mode === 'listen-to-sequence' ? sequence.map((entryIndex) => ALPHABET[entryIndex].word) : [item.word];
      const timer = window.setTimeout(() => speakWords(words, true), 220);
      return () => window.clearTimeout(timer);
    }
  }, [index, item.word, mode, sequence, speakWords]);

  useEffect(() => () => { if (nextTimer.current !== null) window.clearTimeout(nextTimer.current); }, []);

  const currentStats = exerciseProgress[mode];
  const currentAccuracy = accuracy(currentStats);
  const currentAverage = averageTime(currentStats);
  const rank = rankForXp(xp);
  const flightPhaseIndex = Math.min(FLIGHT_PHASES.length - 1, Math.floor(flightCorrect / 5));
  const flightProgress = Math.min(100, Math.round((flightCorrect / DAILY_GOAL) * 100));
  const weakCount = useMemo(() => letterStats.filter((entry) => entry.errors > 0 || entry.avgMs > 3000).length, [letterStats]);

  function prepareNext(nextStats = letterStats) {
    setAnswer(''); setFeedback(null); setReward(0);
    if (mode === 'listen-to-sequence') setSequence(generateSequence(nextStats, sequenceLength));
    else setIndex(pickWeightedIndex(nextStats, index));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || feedback) return;
    const elapsedMs = Math.max(100, performance.now() - startedAt.current);
    const isSequence = mode === 'listen-to-sequence';
    const correct = isSequence ? normalize(answer) === expectedSequence : isCorrectAnswer(mode, answer, item);
    const nextLetterStats = isSequence ? updateSequenceStats(letterStats, sequence, answer, elapsedMs) : updateLetterStats(letterStats, index, correct, elapsedMs);
    const expected = isSequence ? expectedSequence : mode === 'letter-to-word' ? item.word : item.letter;
    const resultingStreak = correct ? currentStats.streak + 1 : 0;
    const earnedXp = xpReward(correct, resultingStreak, mode, sequenceLength);
    setLetterStats(nextLetterStats);
    setExerciseProgress((progress) => updateExerciseProgress(progress, mode, correct, elapsedMs));
    setXp((value) => value + earnedXp); setFlightCorrect((value) => value + (correct ? 1 : 0)); setLastTime(elapsedMs); setReward(earnedXp);
    setFeedback({ correct, text: correct ? (isSequence ? `Odebrano bez błędu: ${expectedSequence}` : `Potwierdzam: ${item.letter} — ${item.word}`) : `Korekta: ${expected}` });
    nextTimer.current = window.setTimeout(() => prepareNext(nextLetterStats), correct ? 800 : 1550);
  }

  function changeMode(nextMode: Mode) {
    if (nextTimer.current !== null) window.clearTimeout(nextTimer.current);
    window.speechSynthesis?.cancel(); setAnswer(''); setFeedback(null); setReward(0); setMode(nextMode);
    if (nextMode === 'listen-to-sequence') setSequence(generateSequence(letterStats, sequenceLength));
    else setIndex(pickWeightedIndex(letterStats, index));
  }

  function changeLength(length: number) {
    window.speechSynthesis?.cancel(); setSequenceLength(length); setAnswer(''); setFeedback(null); setReward(0); setSequence(generateSequence(letterStats, length));
  }

  function resetProgress() {
    if (nextTimer.current !== null) window.clearTimeout(nextTimer.current);
    const empty = createEmptyStats(); setLetterStats(empty); setExerciseProgress(createExerciseProgress()); setXp(0); setFlightCorrect(0); setLastTime(null); setReward(0); setAnswer(''); setFeedback(null);
    setIndex(pickWeightedIndex(empty, index)); setSequence(generateSequence(empty, sequenceLength));
  }

  const replayWords = mode === 'listen-to-sequence' ? sequence.map((entryIndex) => ALPHABET[entryIndex].word) : [item.word];
  const answerLabel = mode === 'letter-to-word' ? 'Słowo kodowe ICAO' : mode === 'listen-to-sequence' ? 'Cała sekwencja znaków' : 'Jeden znak';

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#trainer" aria-label="ICAO Speed Trainer — początek"><span className="brand-mark">A</span><span><strong>ICAO SPEED TRAINER <b>V2</b></strong><small>Panel szkolenia radiowego</small></span></a>
        <div className="top-actions"><span className="online"><i /> SYSTEM ONLINE</span><button className="reset-button" type="button" onClick={resetProgress}>Wyzeruj postęp</button></div>
      </header>

      <section className="flight-deck" aria-label="Postęp pilota">
        <div className="rank-card"><span className="rank-wings" aria-hidden="true">◆</span><div><small>STOPIEŃ</small><strong>{rank.title}</strong><span>{xp} XP</span></div></div>
        <div className="career"><div className="career-label"><span>Droga do: <strong>{rank.nextTitle}</strong></span><span>{rank.progress}%</span></div><div className="progress-track"><i style={{ width: `${rank.progress}%` }} /></div></div>
        <div className="mission"><div><small>BIEŻĄCY LOT</small><strong>{FLIGHT_PHASES[flightPhaseIndex]}</strong></div><div className="mission-score"><strong>{flightCorrect}</strong><span>/ {DAILY_GOAL}</span></div></div>
      </section>

      <div className="flight-path" aria-label={`Postęp lotu: ${flightProgress}%`}>{FLIGHT_PHASES.map((phase, phaseIndex) => <div key={phase} className={phaseIndex <= flightPhaseIndex ? 'reached' : ''}><i>{phaseIndex < flightPhaseIndex ? '✓' : phaseIndex === flightPhaseIndex ? '✈' : ''}</i><span>{phase}</span></div>)}</div>

      <nav className="mode-tabs" aria-label="Tryb ćwiczeń">{MODES.map((entry) => {
        const entryStats = exerciseProgress[entry.id];
        return <button key={entry.id} type="button" className={mode === entry.id ? 'active' : ''} aria-pressed={mode === entry.id} onClick={() => changeMode(entry.id)}><span className="tab-icon">{entry.icon}</span><span><strong>{entry.label}</strong><small>{entryStats.attempts ? `${accuracy(entryStats)}% · ${entryStats.attempts} prób` : entry.description}</small></span></button>;
      })}</nav>

      <section className="workspace" id="trainer">
        <aside className="stats-panel" aria-label={`Wyniki: ${MODES.find((entry) => entry.id === mode)?.label}`}>
          <p className="panel-kicker">AKTYWNE ĆWICZENIE</p><h2>{MODES.find((entry) => entry.id === mode)?.shortLabel}</h2>
          <div className="radar-score"><strong>{currentAccuracy}%</strong><span>skuteczność</span></div>
          <div className="instrument-grid"><div><strong>{currentStats.attempts}</strong><span>próby</span></div><div><strong>{currentStats.streak}</strong><span>seria</span></div><div><strong>{currentStats.bestStreak}</strong><span>rekord</span></div><div><strong>{currentAverage ? `${(currentAverage / 1000).toFixed(1)}s` : '—'}</strong><span>śr. czas</span></div></div>
          <p className="weak-signal">{weakCount ? `${weakCount} znaków wymaga ponownego podejścia` : 'Brak słabych sygnałów — tak trzymaj'}</p>
        </aside>

        <section className="trainer-card" aria-labelledby="question-title">
          <div className="question-head"><p className="mode-label">ZADANIE {String(currentStats.attempts + 1).padStart(3, '0')}</p>{lastTime !== null && <p className="last-time">ostatnio {(lastTime / 1000).toFixed(1)} s</p>}</div>
          <h1 id="question-title">{mode === 'letter-to-word' ? 'Jak brzmi ten znak?' : mode === 'word-to-letter' ? 'Jaki to znak?' : mode === 'listen-to-sequence' ? 'Odbierz depeszę' : 'Jaki znak słyszysz?'}</h1>
          {mode === 'listen-to-sequence' && <div className="length-row"><span>Długość depeszy:</span>{[2,3,4,5,6].map((length) => <button key={length} type="button" className={sequenceLength === length ? 'selected' : ''} onClick={() => changeLength(length)} aria-pressed={sequenceLength === length}>{length}</button>)}</div>}
          {mode === 'letter-to-word' && <div className="prompt-tile letter" aria-label={`Znak ${item.letter}`}>{item.letter}</div>}
          {mode === 'word-to-letter' && <div className="prompt-tile word">{item.word}</div>}
          {(mode === 'listen-to-letter' || mode === 'listen-to-sequence') && <>
            <div className="voice-console">
              <div className="voice-console-head"><label htmlFor="voice-choice">Lektor transmisji</label><span>{voices.length} {voices.length === 1 ? 'głos' : voices.length > 1 && voices.length < 5 ? 'głosy' : 'głosów'}</span></div>
              <select id="voice-choice" value={voiceChoice} onChange={(event) => {
                const choice = event.target.value;
                setVoiceChoice(choice); voiceChoiceRef.current = choice; activeVoiceRef.current = null;
                try { window.localStorage.setItem(VOICE_KEY, choice); } catch { /* Keep the choice for this session. */ }
                window.setTimeout(() => speakWords(replayWords, true), 0);
              }}>
                <option value="rotate">Rotacja lektorów — inny głos co zadanie</option>
                {voices.map((voice) => <option key={`${voice.voiceURI}-${voice.name}`} value={voice.voiceURI}>{voice.name} — {accentLabel(voice.lang)}</option>)}
              </select>
              <div className="voice-status"><i aria-hidden="true" /><span>Teraz nadaje: <strong>{activeVoiceName}</strong></span></div>
              <p>{voiceChoice === 'rotate' ? (voices.length > 1 ? 'System zmienia lektora przy każdym nowym zadaniu.' : 'Rotacja uruchomi się, gdy system udostępni więcej głosów angielskich.') : 'Wybrany lektor pozostaje stały we wszystkich zadaniach.'}</p>
            </div>
            <button className="listen-button" type="button" onClick={() => speakWords(replayWords, false)} aria-label="Odtwórz ponownie tym samym głosem"><span className="speaker">▶</span><span><strong>Odtwórz transmisję</strong><small>{mode === 'listen-to-sequence' ? `${sequenceLength} znaki w depeszy` : 'pojedynczy znak'} · ten sam lektor</small></span></button>
          </>}
          <form onSubmit={submit}><label htmlFor="answer">{answerLabel}</label><div className="answer-row"><input ref={inputRef} id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={mode === 'letter-to-word' ? 'np. Whiskey' : mode === 'listen-to-sequence' ? 'np. MB8' : 'np. W'} maxLength={mode === 'letter-to-word' ? 12 : mode === 'listen-to-sequence' ? 12 : 1} autoComplete="off" autoCapitalize="characters" disabled={Boolean(feedback)} /><button className="submit-button" type="submit" disabled={!answer.trim() || Boolean(feedback)}>Nadaj <span>↵</span></button></div></form>
          <div className={`feedback ${feedback ? (feedback.correct ? 'success' : 'error') : ''}`} role="status" aria-live="polite"><span>{feedback ? feedback.text : 'Kanał otwarty. Wpisz odpowiedź i naciśnij Enter.'}</span>{reward > 0 && <strong>+{reward} XP</strong>}</div>
          {speechProblem && <p className="speech-warning" role="alert">{speechProblem}</p>}
        </section>
      </section>

      <section className="logbook" aria-labelledby="logbook-title"><div className="section-heading"><div><p className="eyebrow">DZIENNIK POKŁADOWY</p><h2 id="logbook-title">Wyniki według ćwiczenia</h2></div><span>Każdy tryb liczy postęp osobno</span></div><div className="log-grid">{MODES.map((entry) => { const entryStats = exerciseProgress[entry.id]; return <article key={entry.id} className={mode === entry.id ? 'current' : ''}><div className="log-card-head"><span className="tab-icon">{entry.icon}</span><div><strong>{entry.shortLabel}</strong><small>{entry.label}</small></div></div><div className="log-accuracy"><strong>{accuracy(entryStats)}%</strong><div><i style={{ width: `${accuracy(entryStats)}%` }} /></div></div><dl><div><dt>Próby</dt><dd>{entryStats.attempts}</dd></div><div><dt>Najlepsza seria</dt><dd>{entryStats.bestStreak}</dd></div><div><dt>Średni czas</dt><dd>{entryStats.attempts ? `${(averageTime(entryStats) / 1000).toFixed(1)} s` : '—'}</dd></div></dl></article>; })}</div></section>

      <section className="reference" aria-labelledby="reference-title"><div className="section-heading"><div><p className="eyebrow">ŚCIĄGA A–Z + 0–9</p><h2 id="reference-title">Alfabet i cyfry ICAO</h2></div></div><div className="alphabet-grid">{ALPHABET.map((entry, entryIndex) => { const entryStats = letterStats[entryIndex]; const needsWork = entryStats.errors > 0 || entryStats.avgMs > 3000; return <div className={needsWork ? 'alphabet-item needs-work' : 'alphabet-item'} key={entry.letter}><strong>{entry.letter}</strong><span>{entry.word}</span></div>; })}</div><p className="reference-note"><span className="dot" /> Żółte oznaczenie wskazuje znaki, które system poda częściej.</p></section>
    </main>
  );
}
