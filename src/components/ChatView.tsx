/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { UserProfile, ChatMessage } from "../types";
import { Send, Image, MessageSquare, Shield, HelpCircle, FileImage, Loader2, ChevronDown, Reply, X, Check, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { chatDayLabel, sameChatList, splitQuote, splitQuoteName, dedupeChat, loadSeen, saveSeen } from "../utils/chat";
import AiChatView from "./AiChatView";

type ChatRoom = "shared" | "admin" | "ai";

interface ChatViewProps {
  userProfile: UserProfile;
  initialRoom?: ChatRoom;
  canUpload?: boolean;
  brandName?: string;
  activeNodes?: import("../types").SubscribedNode[];
  siteConfig?: any;
}

const SEEN_KEY = "chat_seen_v1";

export default function ChatView({ userProfile, initialRoom = "shared", canUpload = false, brandName, activeNodes = [], siteConfig }: ChatViewProps) {
  const [activeRoom, setActiveRoom] = useState<ChatRoom>("shared");
  const [aiThinking, setAiThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [base64Image, setBase64Image] = useState<string>("");
  const [imageName, setImageName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [replyTo, setReplyTo] = useState<{ name: string; text: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState<{ shared: number; admin: number }>({ shared: 0, admin: 0 });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const seenRef = useRef<Record<string, string>>(loadSeen(SEEN_KEY));
  const seenEventAt = useRef(0);
  const scrollTicking = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const otherAbortRef = useRef<AbortController | null>(null);
  const lastIdsRef = useRef<Record<string, string>>({});

  const roomId = useMemo(() => activeRoom === "shared" ? "shared" : activeRoom === "admin" ? `direct_${userProfile.phone}` : "ai", [activeRoom, userProfile.phone]);
  const otherRoomIds = useMemo(() => activeRoom === "shared" ? [`direct_${userProfile.phone}`] : activeRoom === "admin" ? ["shared"] : ["shared", `direct_${userProfile.phone}`], [activeRoom, userProfile.phone]);

  useEffect(() => {
    setActiveRoom(initialRoom);
  }, [initialRoom]);

  const fetchMessages = useCallback(async () => {
    if (activeRoom === "ai") return;
    if (document.hidden) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const list = await fetchJsonWithSignal<ChatMessage[]>(`/api/chat/room/${roomId}`, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setMessages((prev) => (sameChatList(prev, list) ? prev : dedupeChat(list)));
      setIsLoadingMessages(false);
      if (list.length > 0) lastIdsRef.current[roomId] = list[list.length - 1].id;
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("Failed to sync chat room:", err);
    }
  }, [roomId, activeRoom]);

  useEffect(() => {
    if (activeRoom === "ai") return;
    setIsLoadingMessages(true);
    void fetchMessages();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [roomId, activeRoom, fetchMessages]);

  useGatedInterval(() => { void fetchMessages(); }, 5000, { enabled: activeRoom !== "ai", visibilityGate: true });

  const fetchOther = useCallback(async () => {
    if (document.hidden) return;
    if (otherAbortRef.current) otherAbortRef.current.abort();
    const ctrl = new AbortController();
    otherAbortRef.current = ctrl;
    try {
      for (const otherRoomId of otherRoomIds) {
        const list = await fetchJsonWithSignal<ChatMessage[]>(`/api/chat/room/${otherRoomId}`, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const seen = seenRef.current[otherRoomId];
        let n = 0;
        if (seen) {
          const since = new Date(seen).getTime();
          for (const m of list) {
            if (m.sender === userProfile.phone) continue;
            const t = new Date(m.timestamp).getTime();
            if (!isNaN(t) && t > since) n++;
          }
        }
        const key = otherRoomId === "shared" ? "shared" : "admin";
        setUnread((prev) => (prev[key] === n ? prev : { ...prev, [key]: n }));
      }
    } catch {
      /* badge poll is best-effort */
    }
  }, [otherRoomIds, userProfile.phone]);

  useEffect(() => {
    void fetchOther();
    return () => { if (otherAbortRef.current) otherAbortRef.current.abort(); };
  }, [fetchOther]);

  useGatedInterval(() => { void fetchOther(); }, 30000, { enabled: otherRoomIds.length > 0, visibilityGate: true });

  const markSeen = (room: string, list: ChatMessage[]) => {
    if (list.length === 0) return;
    const last = list[list.length - 1].timestamp;
    if (seenRef.current[room] === last) return;
    seenRef.current[room] = last;
    saveSeen(SEEN_KEY, seenRef.current);
    const now = Date.now();
    if (now - seenEventAt.current > 3000) {
      seenEventAt.current = now;
      window.dispatchEvent(new Event("chat-seen"));
    }
    const key = room === "shared" ? "shared" : "admin";
    setUnread((prev) => (prev[key] === 0 ? prev : { ...prev, [key]: 0 }));
  };

  const handleScroll = useCallback(() => {
    if (scrollTicking.current) return;
    scrollTicking.current = true;
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      scrollTicking.current = false;
      const container = chatContainerRef.current;
      if (!container) return;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const nearBottom = distanceFromBottom < 150;
      setShowScrollBottomBtn((prev) => (prev === !nearBottom ? prev : !nearBottom));
      if (nearBottom) markSeen(roomId, messages);
    });
  }, [roomId, messages]);

  useEffect(() => () => { if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current); }, []);

  useEffect(() => {
    setShowScrollBottomBtn(false);
    setReplyTo(null);
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 100);
    return () => clearTimeout(timer);
  }, [roomId]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const lastMessage = messages[messages.length - 1];
    const isMyMessage = lastMessage && lastMessage.sender === userProfile.phone;

    if (distanceFromBottom < 150 || isMyMessage) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      if (messages.length > 0) markSeen(roomId, messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, userProfile.phone]);

  const switchRoom = (room: ChatRoom) => {
    if (room !== activeRoom) {
      setActiveRoom(room);
      setIsLoadingMessages(true);
      setReplyTo(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Image file size limit represents 2MB. Please select a smaller attachment file.");
        return;
      }
      setImageName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBase64Image(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearAttachment = () => {
    setBase64Image("");
    setImageName("");
  };

  const sendPayload = async (text: string, image: string, tmpId: string) => {
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          sender: userProfile.phone,
          senderName: userProfile.username || "Anonymous Member",
          text,
          image
        })
      });

      if (!res.ok) throw new Error("Could not relay text message.");

      const data = await res.json();
      setMessages((prev) => dedupeChat(prev.map((m) => (m.id === tmpId ? data.message : m))));
      setFailedIds((prev) => {
        const next = new Set(prev);
        next.delete(tmpId);
        return next;
      });
    } catch (e) {
      setFailedIds((prev) => new Set(prev).add(tmpId));
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !base64Image) return;

    const quotePrefix = replyTo ? `> ${replyTo.name}: ${replyTo.text.slice(0, 120)}\n` : "";
    const textToSend = quotePrefix + inputText;
    const imageToSend = base64Image;
    const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const optimistic: ChatMessage = {
      id: tmpId,
      roomId,
      sender: userProfile.phone,
      senderName: userProfile.username || "Anonymous Member",
      text: textToSend,
      image: imageToSend || undefined,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, optimistic]);
    setInputText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setReplyTo(null);
    clearAttachment();
    setIsSending(true);
    await sendPayload(textToSend, imageToSend, tmpId);
    setIsSending(false);
  };

  const retryMessage = async (id: string) => {
    const msg = messages.find((m) => m.id === id);
    if (!msg) return;
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setIsSending(true);
    await sendPayload(msg.text, msg.image || "", id);
    setIsSending(false);
  };

  const grouped = useMemo(() => {
    const out: { day: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const day = chatDayLabel(m.timestamp);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  const replyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of messages) map.set(m.id, 0);
    for (const r of messages) {
      const { quote } = splitQuote(r.text);
      if (!quote) continue;
      const { text: quotedBody } = splitQuoteName(quote);
      if (!quotedBody || quotedBody.length < 3) continue;
      for (const parent of messages) {
        if (parent.id === r.id) continue;
        const parentBody = splitQuote(parent.text).body || parent.text;
        if (!parentBody) continue;
        if (parentBody.slice(0, 120) === quotedBody || (quotedBody.length > 10 && parentBody.includes(quotedBody.slice(0, 30)))) {
          map.set(parent.id, (map.get(parent.id) || 0) + 1);
          break;
        }
      }
    }
    return map;
  }, [messages]);

  const renderText = (text: string) => {
    const { quote, body } = splitQuote(text);
    const quoted = quote ? splitQuoteName(quote) : null;
    return (
      <>
        {quoted && (
          <div className="border-l-2 border-[var(--theme-card-border)] opacity-80 pl-2 mb-1.5 text-[11.5px] line-clamp-3">
            {quoted.name && <div className="font-extrabold">{quoted.name}</div>}
            <div className="italic">{quoted.text}</div>
          </div>
        )}
        {body && <p className="whitespace-pre-wrap select-text">{body}</p>}
      </>
    );
  };

  const skeleton = (
    <div className="space-y-4 p-1" aria-label="Loading messages">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`flex flex-col max-w-[75%] space-y-1.5 ${i % 2 ? "ml-auto items-end" : "mr-auto items-start"}`}>
          <div className="h-3 w-24 rounded-full bg-[var(--theme-card-border)] animate-pulse" />
          <div className="h-14 w-48 rounded-2xl bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] animate-pulse" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col overflow-hidden select-none relative">
      <div className="flex-1 flex flex-col justify-between h-full min-w-0 overflow-hidden relative">

        <div className="px-1 py-2 flex items-center justify-center shrink-0 z-10 border-b border-[var(--theme-card-border)]">
          <div className="flex gap-1 w-full max-w-[480px]">
            <button
              type="button"
              onClick={() => switchRoom("shared")}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 relative text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                activeRoom === "shared" ? "text-[var(--theme-primary)]" : "text-[var(--theme-text)] opacity-60 hover:opacity-100"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Threads</span>
              {unread.shared > 0 && (
                <span className="min-w-5 h-5 px-1 rounded-full bg-[var(--theme-primary)] text-white text-[10px] font-black flex items-center justify-center">
                  {unread.shared > 99 ? "99+" : unread.shared}
                </span>
              )}
              {activeRoom === "shared" && <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-[var(--theme-primary)] rounded-full" />}
            </button>

            <button
              type="button"
              onClick={() => switchRoom("ai")}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 relative text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                activeRoom === "ai" ? "text-[var(--theme-primary)]" : "text-[var(--theme-text)] opacity-60 hover:opacity-100"
              }`}
            >
              <span className={aiThinking ? "animate-shimmer" : undefined}>{brandName || "AI"} AI</span>
              {activeRoom === "ai" && <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-[var(--theme-primary)] rounded-full" />}
            </button>

            <button
              type="button"
              onClick={() => switchRoom("admin")}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 relative text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                activeRoom === "admin" ? "text-[var(--theme-primary)]" : "text-[var(--theme-text)] opacity-60 hover:opacity-100"
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Support Desk</span>
              {unread.admin > 0 && (
                <span className="min-w-5 h-5 px-1 rounded-full bg-[var(--theme-primary)] text-white text-[10px] font-black flex items-center justify-center">
                  {unread.admin > 99 ? "99+" : unread.admin}
                </span>
              )}
              {activeRoom === "admin" && <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-[var(--theme-primary)] rounded-full" />}
            </button>
          </div>
        </div>

        {activeRoom === "ai" && (
          <AiChatView userProfile={userProfile} activeNodes={activeNodes} siteConfig={siteConfig} onThinkingChange={setAiThinking} />
        )}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          style={activeRoom === "ai" ? { display: "none" } : undefined}
          className="flex-1 overflow-y-auto p-4 space-y-4 relative scrollbar-none"
        >
          {isLoadingMessages ? (
            skeleton
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--theme-text)] opacity-60 font-sans text-xs text-center p-4 space-y-2">
              <HelpCircle className="w-8 h-8 opacity-40" />
              <span>No messages posted. Start the conversation!</span>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {grouped.map((group) => (
                <div key={group.day} className="space-y-1">
                  <div className="text-center">
                    <span className="inline-block px-3 py-1 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[11px] font-bold text-[var(--theme-text)] opacity-70 rounded-full">
                      {group.day}
                    </span>
                  </div>
                  {group.items.map((m, index) => {
                    const isMe = m.sender === userProfile.phone;
                    const isSystem = m.sender === "system";
                    const isSupportAdmin = m.sender === "admin" || m.senderName.toLowerCase().includes("admin");
                    const failed = failedIds.has(m.id);
                    const prev = group.items[index - 1];
                    const showHeader = !prev || prev.sender !== m.sender || prev.senderName !== m.senderName;

                    if (isSystem) {
                      return (
                        <motion.div
                          key={m.id || index}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                          className="text-center"
                        >
                          <span className="inline-block px-3 py-1 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[11px] font-sans text-[var(--theme-text)] opacity-75 rounded-full shadow-xs">
                            {m.text}
                          </span>
                        </motion.div>
                      );
                    }

                    return (
                      <motion.div
                        key={m.id || index}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: "spring", bounce: 0.1, duration: 0.35 }}
                        className={`group flex flex-col max-w-[92%] sm:max-w-[80%] ${
                          isMe ? "ml-auto items-end" : "mr-auto items-start"
                        } ${failed ? "opacity-70" : ""} ${showHeader ? "mt-3" : "mt-1"}`}
                      >
                        <div
                          className={`rounded-[16px] px-3 py-2.5 space-y-1.5 text-[13px] font-sans leading-relaxed text-[var(--theme-text)] font-medium bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 shadow-sm ${
                            isMe ? "rounded-tr-none" : "rounded-tl-none"
                          }`}
                        >
                          {showHeader && (
                            <div className="flex items-center gap-1.5 text-[11px] font-sans font-bold opacity-80">
                              <span className={`truncate max-w-[140px] ${isMe ? 'text-[var(--theme-primary)]' : isSupportAdmin ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-primary)]'}`}>
                                {isMe ? "You" : isSupportAdmin ? "👾 Support" : m.senderName}
                              </span>
                              <span className="opacity-40 font-medium">•</span>
                              <span className="text-[10px] font-medium opacity-50">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {!isSystem && (
                                <button
                                  type="button"
                                  title={replyCounts.get(m.id) ? `${replyCounts.get(m.id)} ${replyCounts.get(m.id) === 1 ? "reply" : "replies"}` : "Reply"}
                                  onClick={() => setReplyTo({ name: isMe ? "You" : isSupportAdmin ? "👾 Support" : m.senderName, text: splitQuote(m.text).body || "[photo]" })}
                                  className="ml-auto flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)] opacity-90 hover:bg-[var(--theme-primary)]/20 hover:opacity-100 transition-all cursor-pointer"
                                >
                                  <Reply className="w-3 h-3" />
                                  {(replyCounts.get(m.id) || 0) > 0 && <span className="text-[10px] font-black">{replyCounts.get(m.id)}</span>}
                                </button>
                              )}
                            </div>
                          )}
                          {!showHeader && !isSystem && (
                            <div className="flex justify-end pb-1">
                              <button
                                type="button"
                                title={replyCounts.get(m.id) ? `${replyCounts.get(m.id)} ${replyCounts.get(m.id) === 1 ? "reply" : "replies"}` : "Reply"}
                                onClick={() => setReplyTo({ name: isMe ? "You" : isSupportAdmin ? "👾 Support" : m.senderName, text: splitQuote(m.text).body || "[photo]" })}
                                className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)] opacity-90 hover:bg-[var(--theme-primary)]/20 transition-all cursor-pointer"
                              >
                                <Reply className="w-3 h-3" />
                                {(replyCounts.get(m.id) || 0) > 0 && <span className="text-[10px] font-black">{replyCounts.get(m.id)}</span>}
                              </button>
                            </div>
                          )}
                          {renderText(m.text)}

                          {m.image && (
                            <div className="rounded-xl overflow-hidden border border-[var(--theme-card-border)] mt-1 max-w-full bg-[var(--theme-bg)]">
                              <img
                                src={m.image}
                                alt="Message attachment"
                                onClick={() => m.image && setLightbox(m.image)}
                                className="max-h-60 w-auto object-contain cursor-zoom-in hover:scale-[1.02] transition-transform duration-200"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          )}
                          {failed && (
                            <button
                              type="button"
                              onClick={() => retryMessage(m.id)}
                              className="text-[11px] font-bold uppercase tracking-wide underline underline-offset-2 cursor-pointer"
                            >
                              Failed to send, tap to retry
                            </button>
                          )}
                          {!showHeader && (
                            <div className="flex justify-end items-center gap-1 pt-1.5 text-[10px] leading-none text-[var(--theme-text)] opacity-40">
                              <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {isMe && !failed && (m.id.startsWith("tmp_") ? <Check className="w-3 h-3" /> : <CheckCheck className="w-3.5 h-3.5" />)}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>

        {showScrollBottomBtn && activeRoom !== "ai" && (
          <button
            type="button"
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              setShowScrollBottomBtn(false);
              markSeen(roomId, messages);
            }}
            className="absolute bottom-[76px] left-1/2 -translate-x-1/2 z-30 btn-3d-primary text-white p-2.5 rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-all outline-none cursor-pointer"
            title="Scroll to bottom"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        <form onSubmit={handleSendMessage} style={activeRoom === "ai" ? { display: "none" } : undefined} className="p-3 border-t border-[var(--theme-card-border)] bg-transparent space-y-2 shrink-0">
          <AnimatePresence>
            {replyTo && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="flex items-center justify-between bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 shadow-sm px-3 py-2.5 rounded-[var(--theme-radius)] text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 text-[var(--theme-text)]">
                  <div className="w-7 h-7 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/15 flex items-center justify-center shrink-0">
                    <Reply className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                  </div>
                  <span className="truncate font-medium">
                    <span className="font-extrabold">{replyTo.name}</span>
                    <span className="opacity-60"> — {replyTo.text.slice(0, 80)}</span>
                  </span>
                </div>
                <button type="button" onClick={() => setReplyTo(null)} className="ml-2 p-1.5 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] opacity-70 hover:opacity-100 hover:border-[var(--theme-primary)]/30 transition-all cursor-pointer shrink-0" title="Cancel reply">
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {base64Image && (
            <div className="flex items-center justify-between bg-[var(--theme-bg)] p-2.5 rounded-[var(--theme-radius)] text-xs font-sans text-[var(--theme-text)] border border-[var(--theme-card-border)] animate-fadeIn">
              <div className="flex items-center gap-2">
                <FileImage className="w-4 h-4 text-[var(--theme-primary)] block shrink-0" />
                <span className="truncate max-w-[150px] sm:max-w-xs font-medium">{imageName || "Screenshot attachment"}</span>
              </div>
              <button
                type="button"
                onClick={clearAttachment}
                className="text-xs text-rose-500 font-black uppercase tracking-wider px-1.5 cursor-pointer outline-none"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="flex gap-2 items-center">
            {canUpload && (
              <label className="w-11 h-11 btn-3d-secondary text-[var(--theme-text)] rounded-[var(--theme-radius)] flex items-center justify-center cursor-pointer shrink-0" title="Attach screenshot">
                <Image className="w-4.5 h-4.5" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}

            <textarea
              ref={inputRef}
              rows={1}
              placeholder={activeRoom === "shared" ? "Message..." : "Message support..."}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              className="w-full px-4 py-3 max-h-[120px] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none transition-all font-sans placeholder:opacity-50 resize-none overflow-y-auto"
            />

            <button
              type="submit"
              disabled={isSending || (!inputText.trim() && !base64Image)}
              className="w-11 h-11 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)] flex items-center justify-center hover:bg-[var(--theme-primary)]/20 transition-colors shrink-0 outline-none cursor-pointer disabled:opacity-50"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Preview" className="max-h-[85vh] max-w-full object-contain rounded-xl" referrerPolicy="no-referrer" />
        </div>
      )}
    </div>
  );
}
