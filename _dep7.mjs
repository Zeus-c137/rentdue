import fs from "fs";

const FILE = "src/components/DepositView.tsx";
let src = fs.readFileSync(FILE, "utf8");
const toCRLF = (s) => s.replace(/\n/g, "\r\n");

function replaceOnce(name, before, after) {
  const b = src.includes(before) ? before : toCRLF(before);
  const a = b === before ? after : toCRLF(after);
  const count = src.split(b).length - 1;
  if (count !== 1) {
    console.error(`FAIL: ${name}: expected 1 match, got ${count}`);
    process.exit(1);
  }
  src = src.replace(b, a);
  console.log(`OK: ${name}`);
}

// The page used to be one full-bleed translucent slab with no grouping. Now it
// is a column of discrete blocks with consistent 12px gaps, so the method, the
// amount and the action read as separate decisions.
replaceOnce(
  "outer container",
  `    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] space-y-4 select-none p-4 pt-0 min-h-[100dvh]">`,
  `    <div className="min-h-[100dvh] select-none px-4 pb-8 pt-4 text-[var(--theme-text)]">`
);

replaceOnce(
  "header block",
  `      {/* Top �? back + title + product + balance flow with the page */}
      <div className="pt-4 space-y-4">
        {/* Top bar �? back + title on one level */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="w-10 h-10 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/40 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-black tracking-tight text-[26px] leading-none text-[var(--theme-text)] truncate">Add funds</h1>
          </div>
        </div>`,
  `      <div className="space-y-4">
        {/* Back, then the title with the balance directly under it — the two
            numbers a user checks before committing to an amount. */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] transition-all hover:border-[var(--theme-primary)]/40 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[22px] font-black leading-none tracking-tight">Add funds</h1>
            <p className="mt-1 text-[11.5px] font-sans font-medium opacity-50">
              Trading capital {formatCurrency(userProfile.rechargeBalance || 0)}
            </p>
          </div>
        </div>`
);

// The standalone Visa card duplicated the balance the header now states.
replaceOnce(
  "balance card",
  `        {/* Visa balance card �? rechargeable only */}
        <VisaMetricCard
          mode="single"
          leftLabel="Trading capital"
          leftValue={formatCurrency(userProfile.rechargeBalance || 0)}
        />
      </div>`,
  `      </div>`
);

// The method block was a bordered panel inside a panel; it is now its own card.
replaceOnce(
  "method card",
  `        <div className="rounded-[var(--theme-radius)] overflow-hidden">
          {/* Method picker �? segmented pill */}
          <div className="p-3 border-b border-[var(--theme-card-border)] space-y-3">`,
  `        <div className="space-y-4">
          {/* Method picker */}
          <div className="space-y-2.5">`
);

// Close that block before the forms, and give the forms their own card.
replaceOnce(
  "forms wrapper",
  `          {/* Forms */}
          <div className="p-4 space-y-4">`,
  `          {/* Forms */}
          <div className="space-y-4 rounded-[18px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-4">`
);

fs.writeFileSync(FILE, src);
console.log("OK: header + layout");