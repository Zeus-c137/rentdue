/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Avatar stand-in built from the operator's own initials. There is no avatar
 * upload on the account, and a photo would cost a request on a screen that is
 * already busy — so identity is a mark, not a picture.
 */
import React from "react";
import { initialsFor } from "../utils/vip";

interface UserAvatarProps {
  username?: string | null;
  phone?: string | null;
  className?: string;
  onClick?: () => void;
  title?: string;
}

export default function UserAvatar({ username, phone, className = "w-9 h-9 text-[12px]", onClick, title }: UserAvatarProps) {
  const initials = initialsFor(username, phone);
  // Blacked-out mark, no border — initials keep the primary color.
  const shell =
    `${className} rounded-full shrink-0 flex items-center justify-center font-display font-black uppercase leading-none tracking-tight text-[var(--theme-primary)] bg-black`;

  if (!onClick) {
    return (
      <span className={shell} title={title || username || "Operator"}>
        {initials}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title || username || "Operator"}
      aria-label={`Open profile${username ? ` — ${username}` : ""}`}
      className={`${shell} cursor-pointer active:scale-95 transition-transform duration-100`}
    >
      {initials}
    </button>
  );
}
