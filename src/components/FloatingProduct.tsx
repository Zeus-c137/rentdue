/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Product art that flies on its own: it hangs at centre, drifts out to the
 * left, glides back through centre, drifts out to the right, and comes home,
 * forever.
 *
 * The loop is one CSS keyframe animation rather than a Motion timeline on
 * purpose. CSS animations composite off the main thread, so the art keeps
 * moving through a dashboard fetch or a route paint; a JS-driven loop drops
 * frames at exactly that moment. Only transform and opacity animate, and the
 * ground shadow is a blurred pseudo-element, so the image itself is never
 * repainted.
 *
 * Sizing is deliberately identical to the plain <img> this replaces: the stage
 * is the box, the art fills it, and object-contain letterboxes the product
 * inside. Both wrappers carry h-full/w-full because a percentage max-height
 * against an auto-height parent resolves to none [EMDASH] which is how the art
 * would otherwise escape the card and render at its intrinsic size.
 *
 * `active` lets the host stop the loop when the card is off screen or the tab
 * is not live. `still` is the reduced-motion path: a decorative loop carries no
 * information, so there is nothing worth keeping and the art simply sits at
 * rest.
 */

import React from "react";
import { optimizedImageUrl } from "../utils/imageUtils";

interface FloatingProductProps {
  src?: string;
  alt: string;
  /** Runs the idle loop. Turn off when the card is off screen. */
  active?: boolean;
  /** Reduced motion: render the art at rest, no loop. */
  still?: boolean;
  /** Sizing for the stage. The art letterboxes inside it. */
  className?: string;
  imgClassName?: string;
  /** Cloudinary width cap for the requested variant. */
  width?: number;
}

export default function FloatingProduct({
  src,
  alt,
  active = true,
  still = false,
  className = "",
  imgClassName = "",
  width = 640,
}: FloatingProductProps) {
  const resolved = optimizedImageUrl(src, width);
  const looping = active && !still;

  return (
    <div
      className={`float-stage relative flex items-center justify-center ${
        looping ? "is-idle" : ""
      } ${className}`}
    >
      <div className="float-art relative z-1 flex h-full w-full items-center justify-center">
        {resolved ? (
          <img
            src={resolved}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            className={`h-full w-full select-none object-contain ${imgClassName}`}
          />
        ) : (
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--theme-text)]/30">
            No art
          </span>
        )}
      </div>
    </div>
  );
}