/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UserProfile, SubscribedNode } from "../types";

interface AiChatViewProps {
  userProfile: UserProfile;
  activeNodes: SubscribedNode[];
  siteConfig?: any;
  onThinkingChange?: (thinking: boolean) => void;
}

const MAX_STORED_MESSAGES = 50;
const MAX_CONTEXT_MESSAGES = 30;

function loadStoredChats(phone: string): Array<{ sender: "user" | "advisor"; text: string }> {
  try {
    const raw = localStorage.getItem(`ai_chat_${phone}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is { sender: "user" | "advisor"; text: string } =>
        !!m && (m.sender === "user" || m.sender === "advisor") && typeof m.text === "string"
    );
  } catch {
    return [];
  }
}

export default function AiChatView({ userProfile, activeNodes, siteConfig, onThinkingChange }: AiChatViewProps) {
  const [advisorMessages, setAdvisorMessages] = useState<Array<{ sender: "user" | "advisor"; text: string }>>(() =>
    loadStoredChats(userProfile.phone)
  );
  const [advisorInput, setAdvisorInput] = useState("");
  const [isAskingAdvisor, setIsAskingAdvisor] = useState(false);
  const [streamedReply, setStreamedReply] = useState<string | null>(null);
  const advisorScrollRef = useRef<HTMLDivElement>(null);

  const renderAdvisorText = (text: string) => {
    return text.split("\n").map((line, li, arr) => (
      <React.Fragment key={li}>
        {line.split(/(\*\*[^*]+\*\*)/g).map((part, pi) =>
          part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
            <strong key={pi} className="font-black">{part.slice(2, -2)}</strong>
          ) : (
            <React.Fragment key={pi}>{part}</React.Fragment>
          )
        )}
        {li < arr.length - 1 && <br />}
      </React.Fragment>
    ));
  };

  useEffect(() => {
    const el = advisorScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [advisorMessages, streamedReply, isAskingAdvisor]);

  useEffect(() => {
    try {
      localStorage.setItem(`ai_chat_${userProfile.phone}`, JSON.stringify(advisorMessages.slice(-MAX_STORED_MESSAGES)));
    } catch {
      /* storage full or unavailable — chats stay in memory */
    }
  }, [advisorMessages, userProfile.phone]);

  useEffect(() => {
    onThinkingChange?.(isAskingAdvisor && streamedReply === null);
  }, [isAskingAdvisor, streamedReply, onThinkingChange]);

  useEffect(() => {
    setAdvisorMessages(prev => {
      if (prev.length > 0) return prev;
      return [
        {
          sender: "advisor",
          text: `👋 Hello`
        }
      ];
    });
  }, [siteConfig]);

  const handleAskAdvisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advisorInput.trim() || isAskingAdvisor) return;

    const userText = advisorInput;
    setAdvisorMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setAdvisorInput("");
    setIsAskingAdvisor(true);
    let didStream = false;

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...advisorMessages, { sender: "user", text: userText }]
            .slice(-MAX_CONTEXT_MESSAGES)
            .map((m) => ({
              sender: m.sender,
              text: m.text
            })),
          userProfile,
          activeSubscriptions: activeNodes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Advisor consultation failed.");
      }

      const full = String(data.text || "");
      setStreamedReply("");
      let i = 0;
      const step = () => {
        i += 3;
        const slice = full.slice(0, i);
        setStreamedReply(slice);
        if (i < full.length) {
          window.setTimeout(step, 18);
        } else {
          setAdvisorMessages((prev) => [...prev, { sender: "advisor", text: full }]);
          setStreamedReply(null);
          setIsAskingAdvisor(false);
        }
      };
      window.setTimeout(step, 18);
      didStream = true;
      return;
    } catch (err: any) {
      setAdvisorMessages((prev) => [
        ...prev,
        {
          sender: "advisor",
          text: `⚠️ Undergoing maintenance. (Error: ${err.message})`
        }
      ]);
    } finally {
      if (!didStream) setIsAskingAdvisor(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={advisorScrollRef} className="flex-1 flex flex-col space-y-3 overflow-y-auto scrollbar-none p-4 min-h-0">
        {!advisorMessages.some((m) => m.sender === "user") && (
          <div className="shrink-0 my-auto">
            <div className="overflow-x-auto scrollbar-none snap-x snap-mandatory -mx-4 px-4">
              <div className="flex gap-2 w-max mx-auto">
                {["How do daily earnings work?", "How do I deposit?", "How do I withdraw?", "What is the referral bonus?"].map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => setAdvisorInput(q)}
                    className="snap-start whitespace-nowrap text-[11px] font-bold px-3 py-1.5 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] hover:brightness-110 cursor-pointer active:scale-95 transition-all shadow-xs"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {advisorMessages.map((m, index) => (
          <div
            key={index}
            className={`flex flex-col space-y-1 max-w-[85%] ${
              m.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
            }`}
          >
            <span className="text-[10px] text-[var(--theme-text)] opacity-50 font-bold px-1">
              {m.sender === "user" ? "You" : `${siteConfig?.brandName || "AI"} Assistant`}
            </span>
            <div
              className={`px-3 py-2.5 text-[13px] font-sans font-medium rounded-[16px] leading-relaxed bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 shadow-sm text-[var(--theme-text)] ${
                m.sender === "user" ? "rounded-tr-none" : "rounded-tl-none"
              }`}
            >
              {m.sender === "advisor" ? renderAdvisorText(m.text) : m.text}
            </div>
          </div>
        ))}
        {streamedReply !== null && (
          <div className="flex flex-col space-y-1 max-w-[85%] mr-auto items-start" aria-live="polite">
            <span className="text-[10px] text-[var(--theme-text)] opacity-50 font-bold px-1">
              {`${siteConfig?.brandName || "AI"} Assistant`}
            </span>
            <div className="px-3 py-2.5 text-[13px] font-sans font-medium rounded-[16px] rounded-tl-none leading-relaxed bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 shadow-sm text-[var(--theme-text)]">
              {renderAdvisorText(streamedReply)}
              <span className="animate-shimmer font-black">▍</span>
            </div>
          </div>
        )}
        {isAskingAdvisor && streamedReply === null && (
          <div className="flex items-center gap-2 px-1" aria-live="polite">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary)] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
            <span className="animate-shimmer text-xs font-black tracking-wide">Thinking…</span>
          </div>
        )}
      </div>

      <form onSubmit={handleAskAdvisor} className="flex gap-2 p-3 border-t border-[var(--theme-card-border)] bg-transparent shrink-0">
        <input
          type="text"
          required
          placeholder="Ask about earnings, deposits, or withdrawals…"
          value={advisorInput}
          onChange={(e) => setAdvisorInput(e.target.value)}
          className="w-full px-4 py-3 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none transition-all font-sans placeholder:opacity-50"
        />
        <button
          type="submit"
          disabled={isAskingAdvisor || !advisorInput.trim()}
          className="px-5 py-3 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/20 font-black text-xs uppercase tracking-wider disabled:opacity-50 cursor-pointer shrink-0 transition-colors flex items-center gap-1.5"
        >
          <Send className="w-4 h-4" />
          Send
        </button>
      </form>
    </div>
  );
}
