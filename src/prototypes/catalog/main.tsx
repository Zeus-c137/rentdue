import React, { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDownUp, ArrowRight, Check, ChevronDown, Clock3, Coins, Info, Plus, Sparkles, X } from "lucide-react";
import "../../index.css";
import "./prototype.css";

type Variant = "portrait" | "showcase" | "details";
type Product = { id: number; name: string; tier: string; price: number; percent: string; duration: number; total: number; image: string; accent: string; popular?: boolean };

const products: Product[] = [
  { id: 1, name: "Nova Compute", tier: "Starter", price: 25_000, percent: "5%", duration: 30, total: 37_500, image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1000&q=85", accent: "#a3e635", popular: true },
  { id: 2, name: "Orion Node", tier: "Growth", price: 75_000, percent: "5.5%", duration: 30, total: 123_750, image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1000&q=85", accent: "#67e8f9" },
  { id: 3, name: "Atlas Core", tier: "Pro", price: 150_000, percent: "6%", duration: 30, total: 270_000, image: "https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?auto=format&fit=crop&w=1000&q=85", accent: "#c4b5fd", popular: true },
  { id: 4, name: "Helios Grid", tier: "Elite", price: 400_000, percent: "6.5%", duration: 30, total: 780_000, image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1000&q=85", accent: "#fbbf24" },
];
const variants: { id: Variant; name: string; label: string }[] = [
  { id: "portrait", name: "Portrait", label: "Compact two-column cards" },
  { id: "showcase", name: "Showcase", label: "Image-led vertical cards" },
  { id: "details", name: "Details", label: "Progressive detail reveal" },
];
const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

function App() {
  const initial = Math.min(variants.length - 1, Math.max(0, Number(new URLSearchParams(location.search).get("v") || 1) - 1));
  const [variantIndex, setVariantIndex] = useState(initial);
  const [category, setCategory] = useState("All runs");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [preview, setPreview] = useState<Product | null>(null);
  const [notice, setNotice] = useState<Product | null>(null);
  const [replay, setReplay] = useState(0);
  const pickerRef = useRef<HTMLElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = variants[variantIndex];

  const moveHighlight = () => {
    const el = itemRefs.current[variantIndex];
    if (!el || !highlightRef.current) return;
    highlightRef.current.style.width = `${el.offsetWidth}px`;
    highlightRef.current.style.transform = `translateX(${el.offsetLeft}px)`;
  };
  useLayoutEffect(() => { moveHighlight(); }, [variantIndex]);
  useLayoutEffect(() => {
    const a = requestAnimationFrame(() => requestAnimationFrame(() => pickerRef.current?.setAttribute("data-ready", "")));
    window.addEventListener("resize", moveHighlight);
    return () => { cancelAnimationFrame(a); window.removeEventListener("resize", moveHighlight); };
  }, [variantIndex]);

  const selectVariant = (next: number) => {
    if (next < 0 || next >= variants.length) return;
    setVariantIndex(next);
    setExpanded(null);
    const url = new URL(location.href);
    url.searchParams.set("v", String(next + 1));
    history.replaceState(null, "", url);
  };
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= variants.length) selectVariant(n - 1);
      else if (e.key === "ArrowRight") selectVariant((variantIndex + 1) % variants.length);
      else if (e.key === "ArrowLeft") selectVariant((variantIndex - 1 + variants.length) % variants.length);
      else if (e.key.toLowerCase() === "r") { setExpanded(null); setReplay((v) => v + 1); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variantIndex]);

  const filtered = products.filter((p) => category === "All runs" || p.tier === category);
  const image = (product: Product, classes = "") => <img src={product.image} alt={`${product.name} server hardware`} className={`catalog-art ${classes}`} onClick={() => setPreview(product)} />;
  const start = (p: Product, fromPreview = false) => <button className="start-btn" onClick={() => { if (fromPreview) setPreview(null); setNotice(p); }}><Plus size={16} strokeWidth={3} /> Start run</button>;
  const status = (p: Product) => <span className="return-badge"><Sparkles size={12} /> {p.percent} daily</span>;
  const details = (p: Product, full = false) => <div className={`metrics ${full ? "metrics-full" : ""}`}>
    <div><span>Duration</span><b>{p.duration} days</b></div><div><span>Run price</span><b>{money(p.price)}</b></div><div className="metric-total"><span>Total return</span><b>{money(p.total)}</b></div>
  </div>;

  return <div className="proto-page dark" key={`${current.id}-${replay}`}>
    <div className="phone-shell">
      <header className="app-top"><div className="brand-mark">R</div><div className="brand-copy"><b>RentDue</b><span>DAILY RUNS</span></div><button className="balance-pill" onClick={() => setNotice(products[0])}><Coins size={14} /> 125,000</button></header>
      <main className={`catalog-main layout-${current.id}`}>
        <div className="eyebrow">YOUR NEXT RUN</div>
        <div className="title-row"><div><h1>Explore runs</h1><p>Choose a run to start earning daily.</p></div><button className="icon-btn" aria-label="Sort runs" onClick={() => setCategory(category === "All runs" ? "Starter" : "All runs")}><ArrowDownUp size={17} /></button></div>
        <div className="category-tabs" role="tablist">{["All runs", "Starter", "Growth", "Pro", "Elite"].map((c) => <button key={c} onClick={() => setCategory(c)} className={category === c ? "selected" : ""}>{c}</button>)}</div>
        <div className="collection-heading"><div><h2>{category === "All runs" ? "Featured collection" : `${category} runs`}</h2><span>{filtered.length} available</span></div><button className="text-action" onClick={() => setCategory(category === "All runs" ? "Pro" : "All runs")}>See all <ArrowRight size={14} /></button></div>
        {current.id === "portrait" && <div className="product-grid" key="portrait">{filtered.map((p) => <article className="product-card portrait-card" key={p.id}>
          <div className="portrait-image">{image(p)}<span className="tier-tag">{p.tier}</span>{p.popular && <span className="popular-tag">POPULAR</span>}</div>
          <div className="portrait-copy"><div className="card-name-row"><h3>{p.name}</h3><button aria-label={`More about ${p.name}`} onClick={() => setPreview(p)}><Info size={15}/></button></div>{status(p)}<div className="compact-price"><span>From</span><b>{money(p.price)}</b></div><div className="compact-total"><span>Total return</span><b>{money(p.total)}</b></div>{start(p)}</div>
        </article>)}</div>}
        {current.id === "showcase" && <div className="showcase-list" key="showcase">{filtered.map((p) => <article className="product-card showcase-card" key={p.id}>
          <div className="showcase-image" style={{ "--product-accent": p.accent } as React.CSSProperties}>{image(p)}<div className="image-shade"/><span className="showcase-tier">{p.tier} RUN</span><div className="showcase-name"><h3>{p.name}</h3><p>Virtual compute · Daily yield</p></div><span className="showcase-return">{p.percent}<small> / day</small></span></div>
          <div className="showcase-info"><div className="showcase-stat"><span>RUN PRICE</span><b>{money(p.price)}</b></div><div className="showcase-stat"><span>AFTER {p.duration} DAYS</span><b className="green-text">{money(p.total)}</b></div>{start(p)}</div>
        </article>)}</div>}
        {current.id === "details" && <div className="detail-list" key="details">{filtered.map((p) => <article className={`product-card detail-card ${expanded === p.id ? "is-expanded" : ""}`} key={p.id}>
          <div className="detail-image">{image(p)}<span className="tier-tag">{p.tier}</span>{p.popular && <span className="popular-tag">POPULAR</span>}</div>
          <div className="detail-copy"><div className="detail-heading"><div><h3>{p.name}</h3><p>Virtual compute run</p></div>{status(p)}</div><div className="detail-summary"><div><span>Starting at</span><b>{money(p.price)}</b></div><div><span>Daily return</span><b className="green-text">{money(p.price * Number(p.percent.replace("%", "")) / 100)}</b></div></div>
            <button className="breakdown-toggle" aria-expanded={expanded === p.id} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{expanded === p.id ? "Hide breakdown" : "View return breakdown"}<ChevronDown size={16} className={expanded === p.id ? "rotated" : ""}/></button>
            {expanded === p.id && <div className="breakdown">{details(p, true)}<div className="note-row"><Clock3 size={14}/><span>Returns are credited daily for {p.duration} days.</span></div></div>}
            <div className="detail-bottom">{expanded !== p.id && <span>Earn <b>{money(p.total - p.price)}</b> total</span>}{start(p)}</div>
          </div>
        </article>)}</div>}
        {filtered.length === 0 && <div className="empty-results">No runs in this tier yet.</div>}
      </main>
      <nav className="bottom-nav"><button><span className="nav-symbol">⌂</span>Home</button><button className="nav-current"><span className="nav-symbol">▦</span>Runs</button><button><span className="nav-symbol">↗</span>Income</button><button><span className="nav-symbol">◎</span>Profile</button></nav>
    </div>
    <aside className="prototype-caption"><span className="caption-kicker">CATALOG EXPLORATION</span><b>{current.name}</b><span>{current.label}</span><small>Use 1–3 or ← → to compare</small></aside>
    <nav className="proto-picker" aria-label="Prototype variants" ref={pickerRef}>
      <span className="proto-picker-highlight" aria-hidden="true" ref={highlightRef}></span>
      {variants.map((v, i) => <button key={v.id} ref={(el) => { itemRefs.current[i] = el; }} className="proto-picker-item" data-active={variantIndex === i ? "" : undefined} aria-current={variantIndex === i ? "true" : undefined} onClick={() => selectVariant(i)}>{v.name}</button>)}
      <span className="proto-picker-divider" aria-hidden="true"></span><button className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={() => { setExpanded(null); setReplay((v) => v + 1); }}>↻</button>
    </nav>
    {(preview || notice) && <div className="modal-backdrop" onClick={() => { setPreview(null); setNotice(null); }} role="presentation"><section className="prototype-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={() => { setPreview(null); setNotice(null); }} aria-label="Close"><X size={17}/></button>
      {preview ? <>{image(preview, "modal-art")}<span className="modal-tier">{preview.tier} RUN</span><h2>{preview.name}</h2><p>Virtual compute run with daily returns for {preview.duration} days.</p>{details(preview, true)}{start(preview, true)}</> : <><span className="modal-success"><Check size={20}/></span><h2>{notice?.name}</h2><p>This prototype keeps run activation local. In the app, this would open the run confirmation step.</p><button className="start-btn" onClick={() => setNotice(null)}>Got it</button></>}
    </section></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
