import coinSoundUrl from "@/src/assets/audio/coin.mp3";

let coinAudio: HTMLAudioElement | null = null;

function getCoinAudio() {
  if (!coinAudio) {
    coinAudio = new Audio(coinSoundUrl);
    coinAudio.preload = "auto";
    coinAudio.volume = 0.5;
    coinAudio.load();
  }
  return coinAudio;
}

if (typeof window !== "undefined") {
  getCoinAudio();
}

/** Start the preloaded reward sound immediately from an eligible claim tap. */
export function playCheckinSound() {
  if (typeof window === "undefined") return;
  const audio = getCoinAudio();
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Audio feedback must never affect a successful check-in.
  });
}
