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

// 1. Keep the typed text, not a number. A numeric state turns "1." into 1 and
//    the dot disappears, which is what made the field feel like it was
//    rejecting a keystroke.
replaceOnce(
  "usdt state to string",
  `  const [usdtAmountUSD, setUsdtAmountUSD] = useState<number>(5.5);`,
  `  const [usdtAmountUSD, setUsdtAmountUSD] = useState<string>("5.50");`
);

replaceOnce(
  "seed usdt as string",
  `    setUsdtAmountUSD((current) =>
      current === 5.5 && Number(config.usdtRate) > 0
        ? Number((minimumDeposit / Number(config.usdtRate)).toFixed(2))
        : current
    );`,
  `    setUsdtAmountUSD((current) =>
      current === "5.50" && Number(config.usdtRate) > 0
        ? (minimumDeposit / Number(config.usdtRate)).toFixed(2)
        : current
    );`
);

// 2. Every consumer needs the numeric value.
src = src.split(`usdtAmountUSD * config.usdtRate`).join(`usdtValue * config.usdtRate`);
src = src.split(`usdtAmountUSD * (config.usdtRate || 3700)`).join(`usdtValue * (config.usdtRate || 3700)`);

// 3. Derive the number once, next to the other derived values.
replaceOnce(
  "usdtValue derivation",
  `  const footerNote = \`Minimum`,
  `  const usdtValue = Number(usdtAmountUSD) || 0;

  const footerNote = \`Minimum`
);

// 4. The row: USD on the left, the amount, then the UGX equivalent on the right.
replaceOnce(
  "usdt amount row",
  `                <Field label="Amount">
                  <div className="flex items-center gap-2 rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/30 px-2.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      disabled={payType === "gpu"}
                      value={payType === "gpu" ? ((selectedGpu?.amount || 0) / (config.usdtRate || 3700)).toFixed(2) : usdtAmountUSD}
                      onChange={(e) => setUsdtAmountUSD(Number(e.target.value) || 0)}
                      className={\`phone-input \${moneyInputCls} min-w-0 flex-1 border-0 bg-transparent px-1 py-3 text-[17px]\`}
                    />
                    <span className="shrink-0 text-[11px] font-bold opacity-35">USD</span>
                    <span className="h-4 w-px shrink-0 bg-[var(--theme-card-border)]" />
                    <span className="shrink-0 pr-1 text-[11px] font-bold tabular-nums opacity-45">{formatCurrency(finalAmount)}</span>
                  </div>
                </Field>`,
  `                <Field label="Amount">
                  <div className="flex items-center rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 transition-colors focus-within:border-[var(--theme-primary)]">
                    <span className="shrink-0 pl-3 text-[11px] font-bold text-[var(--theme-text)] opacity-40">USD</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      disabled={payType === "gpu"}
                      placeholder="0.00"
                      aria-label="Amount in US dollars"
                      value={payType === "gpu" ? ((selectedGpu?.amount || 0) / (config.usdtRate || 3700)).toFixed(2) : usdtAmountUSD}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^0-9.]/g, "");
                        // One dot only, two decimals at most.
                        const [whole, ...rest] = next.split(".");
                        setUsdtAmountUSD(rest.length ? \`\${whole}.\${rest.join("").slice(0, 2)}\` : whole);
                      }}
                      className="phone-input min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[14px] font-semibold tabular-nums text-[var(--theme-text)] outline-none placeholder:font-medium placeholder:opacity-35"
                    />
                    <span className="shrink-0 border-l border-[var(--theme-card-border)] py-2.5 pl-2.5 pr-3 text-[11px] font-bold tabular-nums text-[var(--theme-text)] opacity-45">
                      {formatCurrency(finalAmount)}
                    </span>
                  </div>
                </Field>`
);

fs.writeFileSync(FILE, src);
console.log("OK: usdt amount row fixed");