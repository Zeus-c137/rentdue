import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";
import { X, ExternalLink } from "lucide-react";

interface CommunitySheetProps {
  open: boolean;
  onClose: () => void;
  siteConfig?: any;
}

// Shared community sheet (WhatsApp / Telegram links). Previously copy-pasted
// across DashboardView and ProfileView, which is why theme fixes landed in
// one place but never the other.
export default function CommunitySheet({ open, onClose, siteConfig }: CommunitySheetProps) {
  const confettiRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!open) return;
    const canvas = confettiRef.current;
    if (!canvas) return;
    const myConfetti = confetti.create(canvas, { resize: true, useWorker: true });
    const id = window.setInterval(() => {
      myConfetti({ particleCount: 2, spread: 60, startVelocity: 12, gravity: 0.5, scalar: 0.8, ticks: 300, origin: { x: Math.random() * 0.6 + 0.2, y: 0 }, colors: ["#CF7500", "#FFE8A3", "#9A4F00"] });
    }, 450);
    return () => window.clearInterval(id);
  }, [open ]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className="relative w-full max-w-sm rounded-[28px] overflow-hidden border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.3)] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%]"
          >
            <div className="relative p-5 pb-6 overflow-hidden">
              <canvas ref={confettiRef} className="absolute inset-0 pointer-events-none" />
              <div className="w-10 h-1 rounded-full bg-[var(--theme-card-border)] mx-auto mb-4 relative" />
              <div className="flex items-center justify-between mb-3 relative">
                <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-70">Join our community</h3>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-transparent hover:opacity-80 flex items-center justify-center text-[var(--theme-text)] opacity-60 transition-colors border-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] font-sans text-[var(--theme-text)] opacity-60 leading-relaxed text-center mb-4 relative">Connect with like minded people from all over the globe — share tips, get support, and grow together.</p>
              <div className="space-y-2.5 relative">
                {siteConfig?.whatsappLink && (
                  <a href={siteConfig.whatsappLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-2xl bg-transparent border-0 hover:opacity-80 transition-colors group">
                    <img src="/whatsapp.svg" alt="WhatsApp" className="w-10 h-10 rounded-xl shrink-0 object-contain bg-transparent p-0 shadow-none" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-black text-[var(--theme-text)] leading-none">WhatsApp Support</span>
                      <span className="block text-[11px] font-bold text-[var(--theme-text)] opacity-60 leading-none mt-1 truncate">{siteConfig.whatsappLink}</span>
                    </span>
                    <ExternalLink className="w-4 h-4 text-[var(--theme-text)] opacity-40 group-hover:opacity-60 shrink-0" />
                  </a>
                )}
                {siteConfig?.telegramLink && (
                  <a href={siteConfig.telegramLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-2xl bg-transparent border-0 hover:opacity-80 transition-colors group">
                    <img src="/telegram.svg" alt="Telegram" className="w-10 h-10 rounded-xl shrink-0 object-contain bg-transparent p-0 shadow-none" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-black text-[var(--theme-text)] leading-none">Telegram Channel</span>
                      <span className="block text-[11px] font-bold text-[var(--theme-text)] opacity-60 leading-none mt-1 truncate">{siteConfig.telegramLink}</span>
                    </span>
                    <ExternalLink className="w-4 h-4 text-[var(--theme-text)] opacity-40 group-hover:opacity-60 shrink-0" />
                  </a>
                )}
                {!siteConfig?.telegramLink && !siteConfig?.whatsappLink && (
                  <p className="text-center text-sm font-bold text-[var(--theme-text)] opacity-60 py-6">No community links configured yet.</p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
