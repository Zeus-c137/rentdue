// Easing tokens for check-in animations
// The overshoot curves (y above 1) make the number feel like it expands

export const EASE = {
  drop: [0.2, 0.9, 0.25, 1.1],      // island entrance
  morph: [0.3, 1.25, 0.35, 1],      // island size change
  overshoot: [0.3, 1.3, 0.4, 1],    // odometer roll
  out: [0.33, 1, 0.68, 1],          // count-up
  fly: [0.5, 0, 0.4, 1],            // coin flight
  burst: [0.1, 0.8, 0.3, 1],        // particles
} as const;