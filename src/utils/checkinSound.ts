import coinSoundUrl from "@/src/assets/audio/coin.mp3";

let coinAudio: HTMLAudioElement | null = null;
let soundUnlocked = false;
let playAfterUnlock = false;

function getCoinAudio() {
  if (!coinAudio) {
    coinAudio = new Audio(coinSoundUrl);
    coinAudio.preload = "auto";
    coinAudio.volume = 0.5;
  }
  return coinAudio;
}

/** Call directly from the user's tap so mobile browsers permit later playback. */
export function unlockCheckinSound() {
  if (typeof window === "undefined" || soundUnlocked) return;
  const audio = getCoinAudio();
  audio.muted = true;
  audio.currentTime = 0;
  void audio.play().then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    soundUnlocked = true;
    if (playAfterUnlock) {
      playAfterUnlock = false;
      playCheckinSound();
    }
  }).catch(() => {
    audio.muted = false;
  });
}

/** Play only after the server confirms the check-in succeeded. */
export function playCheckinSound() {
  if (typeof window === "undefined") return;
  if (!soundUnlocked) {
    playAfterUnlock = true;
    return;
  }
  const audio = getCoinAudio();
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Audio feedback must never affect a successful check-in.
  });
}
