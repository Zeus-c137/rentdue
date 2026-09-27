import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Play, RotateCcw, Flame, ArrowRight, ArrowLeft, Pause, PackageSearch } from "lucide-react";
import { Button } from "./ui/button";
import type { SubscriptionItem } from "../types";
import { fixGitHubImageUrl } from "../utils/imageUtils";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import trophy3d from "@/src/assets/3d/3dicons-trophy-iso-premium.png";
import confetti from "canvas-confetti";

const BEST_ROUNDS_KEY = "hut12_guess_best_v2";
const BEST_ENDLESS_KEY = "hut12_guess_endless_best";
const ROUNDS_TOTAL = 13;
const BUDGETS_MS: Record<Difficulty, number> = {
  easy: 5000,
  medium: 2500,
  hard: 1000,
  ultra: 500,
};

type Difficulty = "easy" | "medium" | "hard" | "ultra";
type GameMode = "rounds" | "endless";

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  ultra: "Ultra",
};

const DIFF_TAG: Record<Difficulty, string> = {
  easy: "Easy · 5s",
  medium: "Medium · 2.5s",
  hard: "Hard · 1s",
  ultra: "Ultra · 0.5s",
};

interface ProductGuessGameProps {
  items: SubscriptionItem[];
  onExit: () => void;
}

interface Option {
  id: string;
  name: string;
  image: string;
}

interface PoolEntry extends Option {
  category: string;
}

type Stage = "idle" | "prompt" | "reveal" | "done";

const isImageUrl = (v: unknown) => {
  const s = String(v || "").trim().toLowerCase();
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:") || s.startsWith("/") || s.startsWith("blob:");
};

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function verdictFor(ms: number): string {
  if (ms < 600) return "Lightning deal!";
  if (ms < 1200) return "Sharp!";
  return "Steady";
}

// Human units: 345ms stays ms, 105446ms becomes 1:45 — never a raw wall.
function formatMs(ms: number): string {
  const v = Math.max(0, Math.round(ms));
  if (v < 1000) return `${v}ms`;
  const totalSeconds = Math.floor(v / 1000);
  const tenths = Math.floor((v % 1000) / 100);
  if (totalSeconds < 60) return `${totalSeconds}.${tenths}s`;
  const m = Math.floor(totalSeconds / 60);
  return `${m}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

// Frontend-only product quiz. Shows a product name + 3 catalog images;
// speed of the correct tap scores. Best lives in localStorage — nothing
// here touches balances, so there is no ledger to game.
export default function ProductGuessGame({ items, onExit }: ProductGuessGameProps) {
  const pool: PoolEntry[] = React.useMemo(
    () =>
      (items || [])
        .filter((i) => !i.disabled && !i.outOfStock && isImageUrl(i.imageUrl))
        .map((i) => ({ id: String(i.id), name: String(i.name), image: fixGitHubImageUrl(i.imageUrl), category: String(i.category || "") })),
    [items]
  );

  const [stage, setStage] = useState<Stage>("idle");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [mode, setMode] = useState<GameMode>("rounds");
  const budgetMs = BUDGETS_MS[difficulty];
  const bestKey = mode === "endless" ? BEST_ENDLESS_KEY : BEST_ROUNDS_KEY;
  const [round, setRound] = useState(1);
  const [target, setTarget] = useState<Option | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [choiceMs, setChoiceMs] = useState(0);
  const [choiceCorrect, setChoiceCorrect] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [lastGain, setLastGain] = useState(0);
  const [paused, setPaused] = useState(false);
  const pauseStartRef = useRef(0);
  const runIdRef = useRef(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [final, setFinal] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [lastTargetId, setLastTargetId] = useState<string | null>(null);
  const [best, setBest] = useState<number | null>(() => {
    try {
      const n = Number(localStorage.getItem(BEST_ROUNDS_KEY));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  });

  const readModeBest = (key: string): number | null => {
    try {
      const n = Number(localStorage.getItem(key));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  };

  // Best is tracked separately per mode (endless scores dwarf 13-round runs).
  useEffect(() => {
    if (stage === "idle") setBest(readModeBest(bestKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const [newBest, setNewBest] = useState(false);
  const [roundStart, setRoundStart] = useState(0);
  const [reduced] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Precache every catalog image once so rounds render with zero pop-in.
  useEffect(() => {
    pool.forEach((p) => {
      try {
        const im = new Image();
        im.decoding = "async";
        im.src = p.image;
      } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length]);

  const deal = (roundNum: number, avoidId: string | null) => {
    const candidates = pool.filter((p) => p.id !== avoidId);
    const source = candidates.length > 0 ? candidates : pool;
    const picked = source[Math.floor(Math.random() * source.length)];
    const sameCat = shuffled(pool.filter((p) => p.id !== picked.id && p.category && p.category === picked.category));
    const others = shuffled(pool.filter((p) => p.id !== picked.id && (!p.category || p.category !== picked.category)));
    const distractors = [...sameCat, ...others].slice(0, 2);
    setTarget({ id: picked.id, name: picked.name, image: picked.image });
    setOptions(shuffled([{ id: picked.id, name: picked.name, image: picked.image }, ...distractors.map((d) => ({ id: d.id, name: d.name, image: d.image }))]));
    setLastTargetId(picked.id);
    setChoiceId(null);
    setTimedOut(false);
    setLastGain(0);
    setPaused(false);
    setRound(roundNum);
    setRoundStart(Date.now());
    setStage("prompt");
  };

  const startGame = () => {
    runIdRef.current += 1;
    setScore(0);
    setStreak(0);
    setStrikes(0);
    setFinal(false);
    setPaused(false);
    setCorrectCount(0);
    setNewBest(false);
    deal(1, null);
  };

  const togglePause = () => {
    if (stage !== "prompt") return;
    if (paused) {
      setRoundStart((prev) => prev + (Date.now() - pauseStartRef.current));
      setPaused(false);
    } else {
      pauseStartRef.current = Date.now();
      setPaused(true);
    }
  };

  const handleBack = () => {
    if (stage === "idle") {
      onExit();
      return;
    }
    // Invalidate any pending auto-finish, freeze the round, back to menu.
    runIdRef.current += 1;
    setPaused(false);
    setTimedOut(false);
    setChoiceId(null);
    setStage("idle");
  };

  const finishGame = (finalScore: number) => {
    setStage("done");
    let prev = 0;
    try { prev = Number(localStorage.getItem(bestKey)) || 0; } catch {}
    if (finalScore > prev) {
      setBest(finalScore);
      setNewBest(true);
      try { localStorage.setItem(bestKey, String(finalScore)); } catch {}
      if (!reduced) {
        try {
          confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
        } catch {}
      }
    } else {
      setNewBest(false);
    }
  };

  const pick = (id: string) => {
    if (stage !== "prompt" || !target || paused) return;
    const ms = Date.now() - roundStart;
    const correct = id === target.id;
    setChoiceId(id);
    setChoiceMs(ms);
    setChoiceCorrect(correct);
    setTimedOut(false);
    if (correct) {
      const speedBonus = Math.max(0, Math.round((600 - ms) / 4));
      const mult = streak >= 2 ? 1.5 : 1;
      const gained = Math.round((100 + speedBonus) * mult);
      setLastGain(gained);
      const nextScore = score + gained;
      setScore(nextScore);
      setStreak(streak + 1);
      setCorrectCount((c) => c + 1);
      if (mode === "rounds" && round >= ROUNDS_TOTAL) {
        setFinal(true);
        const id = runIdRef.current;
        window.setTimeout(() => { if (runIdRef.current === id) finishGame(nextScore); }, 900);
      }
    } else {
      setLastGain(0);
      setStreak(0);
      const newStrikes = strikes + 1;
      setStrikes(newStrikes);
      if (mode === "endless" && newStrikes >= 3) {
        setFinal(true);
        const id = runIdRef.current;
        window.setTimeout(() => { if (runIdRef.current === id) finishGame(score); }, 900);
      }
    }
    setStage("reveal");
  };

  const handleTimeout = () => {
    if (stage !== "prompt") return;
    setChoiceId(null);
    setChoiceMs(budgetMs);
    setChoiceCorrect(false);
    setTimedOut(true);
    setLastGain(0);
    setStreak(0);
    const newStrikes = strikes + 1;
    setStrikes(newStrikes);
    if (mode === "endless" && newStrikes >= 3) {
      setFinal(true);
      const id = runIdRef.current;
      window.setTimeout(() => { if (runIdRef.current === id) finishGame(score); }, 900);
    }
    setStage("reveal");
  };

  const next = () => {
    if (final || (mode === "rounds" && round >= ROUNDS_TOTAL)) {
      finishGame(score);
    } else {
      deal(round + 1, lastTargetId);
    }
  };

  if (pool.length < 3) {
    return (
      <div className="space-y-3 select-none">
        <div className="rounded-[20px] border border-[var(--theme-card-border)]/60 bg-[var(--theme-bg)]/40 p-10 text-center space-y-3">
          <PackageSearch className="w-10 h-10 mx-auto text-[var(--theme-text)] opacity-40" />
          <p className="font-display font-black text-xl text-[var(--theme-text)] tracking-tight">Come back later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 select-none">
      <div className="flex items-center px-1">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--theme-text)] opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {stage === "idle" ? "Profile" : "Menu"}
        </button>
      </div>

      {/* Scoreboard */}
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-60 leading-none">Score</p>
          <p className="font-display font-black text-3xl text-[var(--theme-text)] tracking-tight leading-none mt-1 tabular-nums">{score}</p>
        </div>
        {streak >= 2 && stage !== "done" && (
          <span className="px-2.5 py-1 rounded-full bg-[var(--theme-primary)] text-white text-[11px] font-black flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" /> ×{streak}
          </span>
        )}
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-60 leading-none">Best</p>
          <p className="font-display font-black text-lg text-[var(--theme-primary)] tracking-tight leading-none mt-1 tabular-nums">
            {best !== null ? best : "—"}
          </p>
        </div>
      </div>

      {stage === "idle" && (
        <div className="relative rounded-[20px] border border-[var(--theme-card-border)]/60 bg-[var(--theme-bg)]/40 px-6 py-10 text-center overflow-hidden">
          <img src={trophy3d} alt="" aria-hidden draggable={false} className="absolute -right-8 -bottom-10 w-48 h-48 object-contain opacity-20 rotate-12 pointer-events-none" />
          <img src={dollar3d} alt="" aria-hidden draggable={false} className="absolute -left-10 -top-10 w-40 h-40 object-contain opacity-15 -rotate-12 pointer-events-none" />
          <div className="relative space-y-5">
            <p className="font-display font-black text-3xl text-[var(--theme-text)] tracking-tight leading-tight -rotate-2">
              Product<br />
              <span className="text-[var(--theme-primary)]">Trivia</span>
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap" role="group" aria-label="Difficulty">
              {(Object.keys(DIFF_TAG) as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  aria-pressed={difficulty === d}
                  className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                    difficulty === d
                      ? "bg-transparent text-[var(--theme-primary)] border-[var(--theme-primary)]"
                      : "bg-transparent text-[var(--theme-text)] opacity-60 border-[var(--theme-card-border)] hover:opacity-100"
                  }`}
                >
                  {DIFF_TAG[d]}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2" role="group" aria-label="Mode">
              {(["rounds", "endless"] as GameMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                    mode === m
                      ? "bg-transparent text-[var(--theme-primary)] border-[var(--theme-primary)]"
                      : "bg-transparent text-[var(--theme-text)] opacity-60 border-[var(--theme-card-border)] hover:opacity-100"
                  }`}
                >
                  {m === "rounds" ? `${ROUNDS_TOTAL} Rounds` : "Endless · 3 misses"}
                </button>
              ))}
            </div>
            <div>
              <Button variant="gold-glossy" size="sm" onClick={startGame} glow={false}>
                <Play className="w-4 h-4" /> Play
              </Button>
            </div>
          </div>
        </div>
      )}

      {(stage === "prompt" || stage === "reveal") && target && (
        <>
          <div className="flex flex-col items-center justify-center text-center px-4 py-4 space-y-2.5 min-h-[104px]">
            <p className="font-display font-black text-2xl text-[var(--theme-primary)] tracking-tight leading-tight line-clamp-2">
              {target.name}
            </p>
            <p className={`text-xs font-bold leading-none min-h-[14px] ${stage === "reveal" ? "text-[var(--theme-primary)]" : "text-[var(--theme-text)] opacity-60"}`}>
              {stage === "reveal"
                ? timedOut
                  ? "Too slow!"
                  : choiceCorrect
                    ? `+${lastGain} pts • ${verdictFor(choiceMs)}`
                    : "Wrong pick"
                : "Which product is this? Tap its photo"}
            </p>
          </div>

          {stage === "prompt" && !reduced && (
            <div
              role="timer"
              aria-label="Round time remaining"
              className="w-full bg-[var(--theme-card-bg)] h-3 rounded-full overflow-hidden border border-[var(--theme-card-border)] p-0.5"
            >
              <div
                key={`${round}-${target.id}-${difficulty}`}
                onAnimationEnd={handleTimeout}
                className="round-timer-fill h-full rounded-full bg-[var(--theme-primary)]"
                style={{ animationDuration: `${budgetMs}ms`, animationPlayState: paused ? "paused" : "running" }}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {options.map((o) => {
              const isTarget = o.id === target.id;
              const isChosen = o.id === choiceId;
              const revealed = stage === "reveal";
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pick(o.id)}
                  disabled={revealed}
                  aria-label={`Product photo option`}
                  className="[perspective:600px] aspect-[3/4] cursor-pointer focus:outline-none disabled:cursor-default"
                >
                  <motion.div
                    initial={false}
                    animate={{ rotateY: revealed && isChosen ? 180 : 0 }}
                    transition={reduced ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.45 }}
                    className="relative w-full h-full [transform-style:preserve-3d]"
                  >
                    {/* Photo face */}
                    <div
                      className={`absolute inset-0 rounded-2xl overflow-hidden flex items-center justify-center p-2 [backface-visibility:hidden] border transition-colors ${
                        revealed && isTarget
                          ? "bg-[var(--theme-primary)]/10 border-[var(--theme-primary)] shadow-[0_0_18px_rgba(207,117,0,0.35)]"
                          : revealed
                            ? "bg-[var(--theme-bg)]/50 border-[var(--theme-card-border)] opacity-70"
                            : "bg-[var(--theme-card-bg)]/70 backdrop-blur-xl border-[var(--theme-card-border)] active:scale-95"
                      }`}
                    >
                      <img src={o.image} alt="" loading="eager" decoding="async" draggable={false} className="w-full h-full object-contain drop-shadow pointer-events-none" />
                    </div>
                    {/* Time face (chosen card spins to reveal speed) */}
                    <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-1 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-[var(--theme-card-bg)]/85 backdrop-blur-xl border border-[var(--theme-card-border)]">
                      <span className="font-display font-black text-lg text-[var(--theme-text)] tabular-nums leading-none">{formatMs(choiceMs)}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--theme-primary)] leading-none">
                        {choiceCorrect ? verdictFor(choiceMs) : "Wrong one"}
                      </span>
                    </div>
                  </motion.div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center min-h-[36px]">
            {stage === "prompt" && (
              <button
                type="button"
                onClick={togglePause}
                aria-label={paused ? "Resume round" : "Pause round"}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer border bg-transparent text-[var(--theme-text)] opacity-60 border-[var(--theme-card-border)] hover:opacity-100"
              >
                <Pause className="w-3.5 h-3.5" /> {paused ? "Resume" : "Pause"}
              </button>
            )}
            {stage === "reveal" && (
              final ? (
                <p className="text-[11px] font-bold text-[var(--theme-text)] opacity-60">Final round — tallying…</p>
              ) : (
                <Button variant="gold-glossy" size="sm" onClick={next} glow={false}>
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              )
            )}
          </div>

          {(stage === "prompt" || stage === "reveal") && (
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--theme-text)] opacity-70 leading-none">
                {mode === "rounds" ? `Round ${round} of ${ROUNDS_TOTAL}` : `Round ${round} · Endless`} · {DIFF_LABEL[difficulty]}
              </p>
              {mode === "endless" && (
                <span className="flex items-center justify-center gap-1.5" aria-label={`${3 - strikes} misses left`}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`w-2 h-2 rounded-full ${i < strikes ? "bg-red-500" : "bg-[var(--theme-card-border)]/70"}`}
                    />
                  ))}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {stage === "done" && (
        <div className="rounded-[20px] border border-[var(--theme-card-border)]/60 bg-[var(--theme-bg)]/40 p-8 text-center space-y-2">
          {newBest ? (
            <div className="flex flex-col items-center gap-1">
              <img src={trophy3d} alt="" draggable={false} className="w-14 h-14 object-contain drop-shadow-lg pointer-events-none" />
              <span className="text-[11px] font-black uppercase tracking-widest text-[var(--theme-primary)]">New best!</span>
            </div>
          ) : null}
          <p className="font-display font-black text-4xl text-[var(--theme-text)] tracking-tight tabular-nums">{score}</p>
          <p className="text-[11px] font-bold text-[var(--theme-text)] opacity-60">
            {correctCount}/{mode === "rounds" ? ROUNDS_TOTAL : round} correct{mode === "endless" ? ` • reached round ${round}` : ""}
          </p>
          <div className="pt-1">
            <Button variant="gold-glossy" size="sm" onClick={startGame} glow={false}>
              <RotateCcw className="w-4 h-4" /> Play again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
