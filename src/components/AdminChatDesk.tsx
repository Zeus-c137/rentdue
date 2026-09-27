/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { UserProfile, ChatMessage } from "../types";
import { useCurrency } from "../currency";
import {
  Send,
  Image as ImageIcon,
  MessageSquare,
  User,
  Search,
  X,
  Globe,
  Loader2,
  Paperclip,
  Reply,
  Check,
  CheckCheck,
  ArrowLeft
} from "lucide-react";
import { chatDayLabel, sameChatList, splitQuote, splitQuoteName, dedupeChat, loadSeen, saveSeen } from "../utils/chat";

interface Conversation {
  roomId: string;
  userPhone: string;
  userName: string;
  lastMessage: string;
  lastTimestamp: string;
}

interface AdminChatDeskProps {
  usersList: UserProfile[];
}

const SEEN_KEY = "admin_chat_seen_v1";

const CANNED = [
  "Thanks for reaching out, how can I help?",
  "Please share your transaction ID so I can check.",
  "Your request is being reviewed, I will update you shortly.",
  "This has been resolved on our side, please confirm."
];

export default function AdminChatDesk({ usersList }: AdminChatDeskProps) {
  const { formatCurrency } = useCurrency();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("shared");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [base64Image, setBase64Image] = useState<string>("");
  const [imageName, setImageName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [replyTo, setReplyTo] = useState<{ name: string; text: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  const [searchQuery, setSearchQuery] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const seenRef = useRef<Record<string, string>>(loadSeen(SEEN_KEY));
  const [, forceSeen] = useState(0);

  const fetchConversations = useCallback(async (signal?: AbortSignal) => {
    const s = signal ?? new AbortController().signal;
    try {
      const list = await fetchJsonWithSignal<Conversation[]>("/api/admin/chat/conversations", s);
      const sorted = [...list].sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime());
      setConversations((prev) => (JSON.stringify(prev) === JSON.stringify(sorted) ? prev : sorted));
      setIsLoadingConversations(false);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("Failed to load active direct conversations:", err);
    }
  }, []);

  useEffect(() => { void fetchConversations(); }, [fetchConversations]);
  useGatedInterval(() => { if (!document.hidden) void fetchConversations(); }, 5000, { enabled: true, visibilityGate: true });

  const fetchMessages = useCallback(async (signal?: AbortSignal) => {
    const s = signal ?? new AbortController().signal;
    if (document.hidden) return;
    try {
      const list = await fetchJsonWithSignal<ChatMessage[]>(`/api/chat/room/${selectedRoomId}`, s);
      setMessages((prev) => (sameChatList(prev, list) ? prev : dedupeChat(list)));
      setIsLoadingMessages(false);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("Failed to fetch chat room messages:", err);
    }
  }, [selectedRoomId]);

  useEffect(() => {
    setIsLoadingMessages(true);
    setReplyTo(null);
    void fetchMessages();
  }, [selectedRoomId, fetchMessages]);

  useGatedInterval(() => { void fetchMessages(); }, 5000, { enabled: !!selectedRoomId, visibilityGate: true });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    if (messages.length > 0) {
      seenRef.current[selectedRoomId] = messages[messages.length - 1].timestamp;
      saveSeen(SEEN_KEY, seenRef.current);
    }
  }, [messages, selectedRoomId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Image file size limit is 2MB. Please select a smaller attachment file.");
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
          roomId: selectedRoomId,
          sender: "admin",
          senderName: "Support Admin Team",
          text,
          image
        })
      });

      if (!res.ok) throw new Error("Failed to send support response.");

      const data = await res.json();
      setMessages((prev) => dedupeChat(prev.map((m) => (m.id === tmpId ? data.message : m))));
      setFailedIds((prev) => {
        const next = new Set(prev);
        next.delete(tmpId);
        return next;
      });
    } catch {
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
      roomId: selectedRoomId,
      sender: "admin",
      senderName: "Support Admin Team",
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

  const markAllSeen = () => {
    const map = { ...seenRef.current };
    for (const c of conversations) map[c.roomId] = c.lastTimestamp;
    seenRef.current = map;
    saveSeen(SEEN_KEY, map);
    forceSeen((n) => n + 1);
  };

  const filteredUsersToStartChat = usersList.filter(u => {
    const matchesSearch = u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          u.phone.includes(searchQuery);
    const alreadyConnected = conversations.some(c => c.userPhone === u.phone);
    return matchesSearch && !alreadyConnected && u.phone !== "admin";
  });

  const visibleConversations = conversations;

  const unreadCount = conversations.filter((c) => {
    const seen = seenRef.current[c.roomId];
    if (!seen) return false;
    return new Date(c.lastTimestamp).getTime() > new Date(seen).getTime();
  }).length;

  const getTargetRoomUserObj = () => {
    if (selectedRoomId === "shared") return null;
    const phone = selectedRoomId.replace("direct_", "");
    return usersList.find(u => u.phone === phone) || null;
  };

  const activeUser = getTargetRoomUserObj();

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

  const renderText = (text: string) => {
    const { quote, body } = splitQuote(text);
    const quoted = quote ? splitQuoteName(quote) : null;
    return (
      <>
        {quoted && (
          <div className="border-l-2 border-current opacity-80 pl-2 mb-1.5 text-[11px] line-clamp-3">
            {quoted.name && <div className="font-extrabold">{quoted.name}</div>}
            <div className="italic">{quoted.text}</div>
          </div>
        )}
        {body && <p className="text-xs font-bold whitespace-pre-wrap leading-relaxed break-words">{body}</p>}
      </>
    );
  };

  const pickRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setMobileView("chat");
  };

  return (
    <div className="flex-1 w-full flex bg-[var(--theme-card-bg)] text-[var(--theme-text)] font-sans overflow-hidden relative">

      <div className={`${mobileView === "chat" ? "hidden md:flex" : "flex"} w-full md:w-80 border-r border-[var(--theme-card-border)] flex-col shrink-0 bg-[var(--theme-bg)]/30`}>
        <div className="p-4 border-b border-[var(--theme-card-border)] space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[var(--theme-text)] opacity-70">
              Conversations{unreadCount > 0 ? ` (${unreadCount} new)` : ""}
            </h3>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllSeen} className="text-[11px] font-bold text-[var(--theme-primary)] hover:underline cursor-pointer">
                Mark all read
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-[var(--theme-text)] opacity-50" />
            <input
              type="text"
              placeholder="Start chat (search phone...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] rounded-[var(--theme-radius)] pl-9 pr-4 py-2 text-xs font-bold text-[var(--theme-text)] outline-none transition-all placeholder-[var(--theme-text)]/40"
            />
          </div>

        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {searchQuery ? (
            <div className="space-y-1">
              <span className="text-[12px] font-sans px-3 text-[var(--theme-text)] opacity-70 uppercase font-bold tracking-wide block mb-1">New Contacts ({filteredUsersToStartChat.length})</span>
              {filteredUsersToStartChat.length === 0 ? (
                <div className="p-3 text-xs text-[var(--theme-text)] opacity-50 text-center font-medium">No unconnected users matches search.</div>
              ) : (
                filteredUsersToStartChat.slice(0, 10).map((u) => (
                  <button
                    key={u.phone}
                    onClick={() => {
                      pickRoom(`direct_${u.phone}`);
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-[var(--theme-radius)] hover:bg-[var(--theme-card-bg)] text-left outline-none transition-all group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] font-bold text-xs">
                      {u.username ? u.username[0].toUpperCase() : <User className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[var(--theme-text)] truncate">{u.username || "Anonymous User"}</div>
                      <div className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 truncate">{u.phone}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              <button
                onClick={() => pickRoom("shared")}
                className={`w-full flex items-center gap-3 p-3.5 rounded-[var(--theme-radius)] text-left outline-none transition-all cursor-pointer ${
                  selectedRoomId === "shared"
                    ? "bg-[var(--theme-primary)] text-white shadow-md font-bold"
                    : "hover:bg-[var(--theme-card-bg)] text-[var(--theme-text)] opacity-90"
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs shrink-0 ${
                  selectedRoomId === "shared" ? "bg-white/20 text-white" : "bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 text-[var(--theme-accent)]"
                }`}>
                  <Globe className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold truncate leading-tight">Global Channel</div>
                  <div className={`text-[12px] font-sans truncate mt-0.5 ${selectedRoomId === "shared" ? "text-white/80" : "text-[var(--theme-text)] opacity-60"}`}>
                    Public community room
                  </div>
                </div>
              </button>

              <div className="pt-3 border-t border-[var(--theme-card-border)] mt-2">
                <span className="text-[12px] font-sans px-3 text-[var(--theme-text)] opacity-70 uppercase font-bold tracking-wide block mb-1">Direct Sessions ({visibleConversations.length})</span>
                {isLoadingConversations ? (
                  <div className="space-y-2 p-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-14 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] animate-pulse" />
                    ))}
                  </div>
                ) : visibleConversations.length === 0 ? (
                  <div className="p-6 text-xs text-[var(--theme-text)] opacity-50 text-center font-bold leading-relaxed">No support tickets here.</div>
                ) : (
                  visibleConversations.map((c) => {
                    const isActive = selectedRoomId === c.roomId;
                    const seen = seenRef.current[c.roomId];
                    const hasUnread = seen ? new Date(c.lastTimestamp).getTime() > new Date(seen).getTime() : true;
                    const known = usersList.find((u) => u.phone === c.userPhone);
                    const displayName = known?.username && !/admin/i.test(known.username) ? known.username : null;
                    return (
                      <button
                        key={c.roomId}
                        onClick={() => pickRoom(c.roomId)}
                        className={`w-full flex items-center gap-3 p-3 rounded-[var(--theme-radius)] text-left outline-none transition-all my-0.5 cursor-pointer ${
                          isActive
                            ? "bg-[var(--theme-bg)] text-[var(--theme-text)] shadow-inner border border-[var(--theme-card-border)] font-bold"
                            : "hover:bg-[var(--theme-bg)]/50 text-[var(--theme-text)] opacity-90"
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div className="w-8 h-8 rounded-full bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] font-bold text-xs shrink-0">
                            {(displayName || c.userPhone || "?").charAt(0).toUpperCase()}
                          </div>
                          {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--theme-primary)] border-2 border-[var(--theme-bg)]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between items-baseline gap-1.5">
                            <span className="text-xs font-bold text-[var(--theme-text)] truncate">
                              {c.userPhone}
                              {displayName && <span className="font-medium opacity-60"> • {displayName}</span>}
                            </span>
                            <span className="text-[11px] font-sans text-[var(--theme-text)] opacity-50 shrink-0">
                              {c.lastTimestamp ? new Date(c.lastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                            </span>
                          </div>
                          <div className={`text-[12px] truncate mt-0.5 leading-normal ${hasUnread ? "text-[var(--theme-text)] font-bold" : "text-[var(--theme-text)] opacity-70"}`}>
                            {c.lastMessage}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className={`${mobileView === "list" ? "hidden md:flex" : "flex"} flex-1 flex-col bg-[var(--theme-card-bg)] min-w-0`}>

        <div className="px-4 md:px-6 py-4 border-b border-[var(--theme-card-border)] bg-[var(--theme-bg)]/30 flex justify-between items-center shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={() => setMobileView("list")} className="md:hidden p-2 -ml-2 cursor-pointer opacity-70 hover:opacity-100" title="Back to list">
              <ArrowLeft className="w-4 h-4" />
            </button>
            {selectedRoomId === "shared" ? (
              <>
                <div className="w-9 h-9 rounded-full bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 flex items-center justify-center text-[var(--theme-accent)] shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-[var(--theme-text)]">Global Chat Channel</h4>
                  <p className="text-[12px] font-sans text-[var(--theme-accent)] font-semibold truncate">Broadcast updates to all members</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-9 h-9 rounded-full bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] shrink-0 font-bold text-sm">
                  {activeUser?.username ? activeUser.username[0].toUpperCase() : "M"}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-[var(--theme-text)] truncate">{activeUser?.username || "Support ticket"}</h4>
                  <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 truncate">Phone: {selectedRoomId.replace("direct_", "")}</p>
                </div>
              </>
            )}
          </div>
          {selectedRoomId !== "shared" && activeUser && (
            <div className="text-right hidden md:block shrink-0">
              <span className={`px-2 py-0.5 rounded text-[11px] font-sans font-extrabold uppercase ${
                activeUser.locked ? "bg-rose-500/15 text-rose-400 border border-rose-500/20" : "bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/20"
              }`}>
                {activeUser.locked ? "LOCKED" : "ACTIVE"}
              </span>
              <div className="text-[12px] font-sans text-[var(--theme-text)] opacity-70 mt-1 font-bold">
                Balance: {formatCurrency(activeUser.points || 0)}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {isLoadingMessages && messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--theme-primary)]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <MessageSquare className="w-8 h-8 text-[var(--theme-text)] opacity-30" />
              <p className="text-xs text-[var(--theme-text)] opacity-60 max-w-sm font-bold">
                Nothing here yet. Send a welcome message to get the conversation started.
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.day} className="space-y-1">
                <div className="text-center">
                  <span className="inline-block px-3 py-1 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] text-[11px] font-bold text-[var(--theme-text)] opacity-70 rounded-full">
                    {group.day}
                  </span>
                </div>
                {group.items.map((m, index) => {
                  const uIsAdmin = m.sender === "admin";
                  const failed = failedIds.has(m.id);
                  const prev = group.items[index - 1];
                  const showHeader = !prev || prev.sender !== m.sender;
                  const rawName = usersList.find((u) => u.phone === m.sender)?.username || m.senderName;
                  const senderLabel = uIsAdmin ? "👾 Support Agent" : !rawName || /admin/i.test(rawName) ? m.sender : rawName;
                  return (
                    <div
                      key={m.id}
                      className={`group flex flex-col max-w-[92%] md:max-w-[85%] ${uIsAdmin ? "ml-auto items-end" : "mr-auto items-start"} ${failed ? "opacity-70" : ""} ${showHeader ? "mt-3" : "mt-1"}`}
                    >
                      {showHeader && (
                      <span className="text-xs font-sans text-[var(--theme-text)] opacity-60 mb-1 font-black flex items-center gap-1.5">
                        {senderLabel}
                        {!uIsAdmin && (
                          <button
                            type="button"
                            title="Quote reply"
                            onClick={() => setReplyTo({ name: senderLabel, text: splitQuote(m.text).body || "[photo]" })}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-1 px-1.5 py-1 hover:text-[var(--theme-primary)] cursor-pointer"
                          >
                            <Reply className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-extrabold uppercase tracking-wide">Reply</span>
                          </button>
                        )}
                      </span>
                      )}

                      <div className={`chat-bubble-flat rounded-xl p-3 font-bold text-[var(--theme-text)] ${uIsAdmin
                          ? "rounded-tr-none"
                          : "rounded-tl-none"
                      }`}>
                        {m.image && (
                          <img
                            src={m.image}
                            alt="attachment"
                            referrerPolicy="no-referrer"
                            onClick={() => m.image && setLightbox(m.image)}
                            className="max-h-60 rounded-xl object-contain mb-2 max-w-full cursor-zoom-in"
                          />
                        )}
                        {renderText(m.text)}
                        {failed && (
                          <button type="button" onClick={() => retryMessage(m.id)} className="text-[11px] font-bold uppercase underline underline-offset-2 cursor-pointer mt-1">
                            Failed, tap to retry
                          </button>
                        )}
                        <div className="flex justify-end items-center gap-1 pt-0.5 text-[10px] leading-none text-[var(--theme-text)] opacity-50">
                          <span>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}</span>
                          {uIsAdmin && !failed && (m.id.startsWith("tmp_") ? <Check className="w-3 h-3" /> : <CheckCheck className="w-3.5 h-3.5" />)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-4 border-t border-[var(--theme-card-border)] bg-[var(--theme-bg)]/30 space-y-2 shrink-0">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {CANNED.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setInputText((prev) => (prev ? prev + " " : "") + c)}
                className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] opacity-70 hover:opacity-100 hover:border-[var(--theme-primary)] transition-all cursor-pointer whitespace-nowrap"
              >
                {c.slice(0, 32)}…
              </button>
            ))}
          </div>

          {replyTo && (
            <div className="flex items-center justify-between bg-[var(--theme-card-bg)] px-3 py-2 rounded-[var(--theme-radius)] border border-[var(--theme-card-border)] text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Reply className="w-3.5 h-3.5 text-[var(--theme-primary)] shrink-0" />
                <span className="truncate font-medium">
                  <span className="font-extrabold">{replyTo.name}</span>
                  <span className="opacity-60"> — {replyTo.text.slice(0, 80)}</span>
                </span>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} className="p-1 cursor-pointer opacity-60 hover:opacity-100" title="Cancel reply">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {base64Image && (
            <div className="px-3.5 py-1.5 bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 rounded-2xl flex items-center justify-between w-max max-w-full gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-3.5 h-3.5 text-[var(--theme-primary)] shrink-0" />
                <span className="text-[12px] font-sans text-[var(--theme-text)] truncate">{imageName || "image_loaded.png"}</span>
              </div>
              <button
                type="button"
                onClick={clearAttachment}
                className="text-[var(--theme-text)] opacity-60 hover:opacity-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <label className="p-3 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] hover:bg-[var(--theme-bg)] text-[var(--theme-text)] opacity-80 hover:opacity-100 transition-colors rounded-[var(--theme-radius)] shrink-0 flex items-center justify-center cursor-pointer relative shadow-md">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Paperclip className="w-4 h-4" />
            </label>

            <textarea
              ref={inputRef}
              rows={1}
              placeholder={selectedRoomId === "shared" ? "Broadcast to community room..." : "Reply to member..."}
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
              className="flex-1 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] rounded-[var(--theme-radius)] px-4 py-3 max-h-[120px] text-xs font-bold text-[var(--theme-text)] outline-none transition-all placeholder-[var(--theme-text)]/40 resize-none overflow-y-auto"
            />

            <button
              type="submit"
              disabled={(!inputText.trim() && !base64Image) || isSending}
              className="p-3 bg-[var(--theme-primary)] hover:brightness-110 disabled:opacity-50 text-white rounded-[var(--theme-radius)] shrink-0 flex items-center justify-center transition-all outline-none shadow-md cursor-pointer"
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
