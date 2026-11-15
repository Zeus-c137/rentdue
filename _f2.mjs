import fs from "fs";

const FILE = "src/components/DepositView.tsx";
let src = fs.readFileSync(FILE, "utf8");
const toCRLF = (s) => s.replace(/\n/g, "\r\n");

// ---------------------------------------------------------------------------
// 1. Hoist the field primitives to module scope. Declaring them inside the
//    component meant a new function identity on every render, so React
//    unmounted and remounted the input on each keystroke — which is exactly
//    why one character could be typed before focus was lost.
// ---------------------------------------------------------------------------
const start = src.indexOf(toCRLF(`  /** Label + control, no hints. Copy that matters lives under the form. */`));
const end = src.indexOf(toCRLF(`  /** Form footer copy. One place, so the wording stays identical. */`));
if (start === -1 || end === -1 || end <= start) {
  console.error(`FAIL: primitives (${start}, ${end})`);
  process.exit(1);
}

const primitives = `  const footerNote = \`Minimum \${formatCurrency(minimumDeposit)}\${
    maximumDeposit > 0 ? \` · maximum \${formatCurrency(maximumDeposit)}\` : ""
  }\`;

`;

src = src.slice(0, start) + toCRLF(primitives) + src.slice(end);

// Remove the in-component Footer declaration; the note is a string now.
const footerStart = src.indexOf(toCRLF(`  /** Form footer copy. One place, so the wording stays identical. */`));
const footerEnd = src.indexOf(toCRLF(`  const PillBtn: React.FC<{`));
if (footerStart === -1 || footerEnd === -1 || footerEnd <= footerStart) {
  console.error(`FAIL: footer (${footerStart}, ${footerEnd})`);
  process.exit(1);
}
src = src.slice(0, footerStart) + src.slice(footerEnd);
console.log("OK: in-component primitives removed");

// ---------------------------------------------------------------------------
// 2. Module-scope components, inserted just above the default export.
// ---------------------------------------------------------------------------
const anchor = toCRLF(`export default function DepositView({`);
if (src.split(anchor).length - 1 !== 1) {
  console.error("FAIL: export anchor");
  process.exit(1);
}

const moduleScope = `/** Shared field shell. One border, one fill, one focus colour. */
const fieldShell =
  "w-full rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 px-3 py-2.5 text-[14px] font-semibold text-[var(--theme-text)] outline-none transition-colors placeholder:font-medium placeholder:opacity-35 focus:border-[var(--theme-primary)] disabled:opacity-55";

/** Label + control. Declared at module scope so typing never remounts it. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-text)] opacity-45">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Uganda number: flag and dial code inside the box, fixed to +256. */
function PhoneField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  readOnly?: boolean;
}) {
  return (
    <Field label={label}>
      <div
        className={\`flex w-full items-center rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 transition-colors \${
          readOnly ? "opacity-70" : "focus-within:border-[var(--theme-primary)]"
        }\`}
      >
        <span className="flex shrink-0 items-center gap-1.5 border-r border-[var(--theme-card-border)] py-2.5 pl-2.5 pr-2.5">
          <img src="/flags/uganda.svg" alt="" aria-hidden="true" className="h-3.5 w-5 rounded-[1px] object-cover" />
          <span className="text-[13.5px] font-normal tabular-nums text-[var(--theme-text)]">+256</span>
        </span>
        <input
          type="tel"
          required
          inputMode="numeric"
          autoComplete="tel"
          placeholder="700 000 000"
          aria-label={label}
          readOnly={readOnly}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
          className="phone-input min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[14px] font-semibold tabular-nums text-[var(--theme-text)] outline-none placeholder:font-medium placeholder:opacity-35"
        />
      </div>
    </Field>
  );
}

`;

src = src.replace(anchor, toCRLF(moduleScope) + anchor);
console.log("OK: module-scope primitives added");

// ---------------------------------------------------------------------------
// 3. The in-component inputCls / moneyInputCls now alias the shared shell.
// ---------------------------------------------------------------------------
const clsStart = src.indexOf(toCRLF(`  const inputCls =`));
const clsEnd = src.indexOf(toCRLF(`  /** Digits with thousands separators`));
if (clsStart === -1 || clsEnd === -1 || clsEnd <= clsStart) {
  console.error(`FAIL: inputCls (${clsStart}, ${clsEnd})`);
  process.exit(1);
}
src =
  src.slice(0, clsStart) +
  toCRLF(`  const inputCls = fieldShell;
  const moneyInputCls = \`\${fieldShell} tabular-nums\`;

`) +
  src.slice(clsEnd);
console.log("OK: input classes unified");

fs.writeFileSync(FILE, src);