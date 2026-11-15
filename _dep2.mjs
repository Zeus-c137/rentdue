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

// ---------------------------------------------------------------------------
// AUTO (instant mobile money): amount first, then the number it will be
// charged to, then the button. The old order asked for a phone before the
// amount, which reads as a form rather than as a payment.
// ---------------------------------------------------------------------------
replaceOnce(
  "auto form",
  `              <form onSubmit={handleStartPayment} className="space-y-5">
                <div className="space-y-3">
                  <p className="flex items-start gap-2 text-[13px] font-sans font-medium opacity-60">
                    <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Account recharge minimum is {formatCurrency(minimumDeposit)}. The funds reflect in your account instantly.</span>
                  </p>
                  <div className="space-y-2">
                    <label className="text-[13px] font-sans font-medium opacity-60">Mobile money number</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] px-2.5 py-1 text-[11px] font-black">+256</span>
                      <input
                        type="text"
                        required
                        placeholder=""
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-[72px] pr-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40 transition-colors"
                      />
                      <Smartphone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[13px] font-sans font-medium opacity-60">Amount (UGX)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black opacity-50">UGX</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        required`,
  `              <form onSubmit={handleStartPayment} className="space-y-5">
                {/* The amount is the decision; everything else is detail, so it
                    leads and it is the only oversized element on the screen. */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-sans font-bold uppercase tracking-[0.1em] text-[var(--theme-text)] opacity-55">
                    Amount to add
                  </span>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-black opacity-40">UGX</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      aria-label="Amount to add in Ugandan shillings"`
);

replaceOnce(
  "auto form tail",
  `                        disabled={payType === "gpu"}
                        value={payType === "gpu" ? selectedGpu?.amount || 0 : depositAmount}
                        onChange={(e) => setDepositAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-12 pr-4 text-[15px] font-black outline-none transition-colors disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  loading={isSubmitting}
                  disabled={payType === "gpu" && !selectedGpu}
                  className="w-full"
                >
                  <span>Deposit</span>
                </Button>
              </form>`,
  `                      disabled={payType === "gpu"}
                      value={payType === "gpu" ? selectedGpu?.amount || 0 : depositAmount}
                      onChange={(e) => setDepositAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                      className={\`\${inputCls} py-4 pl-14 text-[22px] font-black tabular-nums tracking-tight\`}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] font-sans font-medium opacity-45">
                    Minimum {formatCurrency(minimumDeposit)}{maximumDeposit > 0 ? \` · maximum \${formatCurrency(maximumDeposit)}\` : ""}
                  </p>
                </div>

                <Field label="Mobile money number" hint="We send a PIN prompt to this number. Approve it to finish.">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-2 py-1 text-[11px] font-black">
                      +256
                    </span>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="7XX XXX XXX"
                      aria-label="Mobile money number"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className={\`\${inputCls} pl-[68px] pr-10\`}
                    />
                    <Smartphone className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-30" />
                  </div>
                </Field>

                <TrustNote>
                  No card details, no app install. You approve the request on your own phone, and nothing is
                  charged until you enter your PIN.
                </TrustNote>

                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  loading={isSubmitting}
                  disabled={payType === "gpu" && !selectedGpu}
                  className="w-full"
                >
                  <span>Send payment request · {formatCurrency(finalAmount)}</span>
                </Button>
              </form>`
);

// ---------------------------------------------------------------------------
// MANUAL (transfer + proof): receiver first (that is what you act on), then
// amount, then the reference that proves it.
// ---------------------------------------------------------------------------
replaceOnce(
  "manual receiver cards",
  `                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {config.mtnReceiverPhone ? (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {config.mtnLogoUrl ? (
                            <img src={config.mtnLogoUrl} alt="MTN" className="w-8 h-8 rounded-full bg-white p-1 object-contain border border-[var(--theme-card-border)] shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">MTN</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 leading-none">MTN Uganda</p>
                            <p className="text-sm font-black leading-none mt-1 select-all truncate">{config.mtnReceiverPhone}</p>
                            <p className="text-[11px] font-bold opacity-60 truncate">{config.mtnReceiverName || "PJNATAL"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(config.mtnReceiverPhone);
                            toast.success("MTN number copied");
                          }}
                          className="shrink-0 w-8 h-8 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-bg)] border border-dashed border-[var(--theme-card-border)] p-3 text-xs font-bold opacity-50">MTN offline</div>
                    )}
                    {config.airtelReceiverPhone ? (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {config.airtelLogoUrl ? (
                            <img src={config.airtelLogoUrl} alt="Airtel" className="w-8 h-8 rounded-full bg-white p-1 object-contain border border-[var(--theme-card-border)] shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">AT</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-rose-600 leading-none">Airtel Money</p>
                            <p className="text-sm font-black leading-none mt-1 select-all truncate">{config.airtelReceiverPhone}</p>
                            <p className="text-[11px] font-bold opacity-60 truncate">{config.airtelReceiverName || "PJNATAL"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(config.airtelReceiverPhone);
                            toast.success("Airtel number copied");
                          }}
                          className="shrink-0 w-8 h-8 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-bg)] border border-dashed border-[var(--theme-card-border)] p-3 text-xs font-bold opacity-50">Airtel offline</div>
                    )}
                  </div>
                  <div className="rounded-full bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 px-3 py-2 flex items-center justify-between gap-2 text-xs font-black">
                    <span className="opacity-70">Exact amount</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[var(--theme-primary)]">{formatCurrency(finalAmount)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(String(finalAmount));
                          toast.success("Amount copied");
                        }}
                        className="w-7 h-7 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                </div>`,
  `                <div className="space-y-2.5">
                  <TrustNote>
                    Send from your own mobile money wallet, then paste the transaction ID below. We match it
                    against the receiver number — a transfer from a different number cannot be verified.
                  </TrustNote>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {config.mtnReceiverPhone ? (
                      <div className="flex items-center justify-between gap-2 rounded-[14px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-3.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          {config.mtnLogoUrl ? (
                            <img src={config.mtnLogoUrl} alt="MTN" className="h-8 w-8 shrink-0 rounded-full border border-[var(--theme-card-border)] bg-white object-contain p-1" />
                          ) : (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFCC00] text-[10px] font-black text-black">MTN</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase leading-none tracking-wider text-[var(--theme-text)] opacity-50">
                              MTN number
                            </p>
                            <p className="mt-1 select-all truncate text-[15px] font-black leading-none tabular-nums">
                              {config.mtnReceiverPhone}
                            </p>
                            <p className="mt-1 truncate text-[11px] font-semibold opacity-50">
                              {config.mtnReceiverName || "Registered name"}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Copy MTN number"
                          onClick={() => {
                            navigator.clipboard.writeText(config.mtnReceiverPhone);
                            toast.success("MTN number copied");
                          }}
                          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-bg)] transition-colors hover:border-[var(--theme-primary)]/40"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-[var(--theme-card-border)] p-3.5 text-[11px] font-bold opacity-45">
                        MTN receiving is paused
                      </div>
                    )}
                    {config.airtelReceiverPhone ? (
                      <div className="flex items-center justify-between gap-2 rounded-[14px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-3.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          {config.airtelLogoUrl ? (
                            <img src={config.airtelLogoUrl} alt="Airtel" className="h-8 w-8 shrink-0 rounded-full border border-[var(--theme-card-border)] bg-white object-contain p-1" />
                          ) : (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF0000] text-[9px] font-black text-white">AT</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase leading-none tracking-wider text-[var(--theme-text)] opacity-50">
                              Airtel number
                            </p>
                            <p className="mt-1 select-all truncate text-[15px] font-black leading-none tabular-nums">
                              {config.airtelReceiverPhone}
                            </p>
                            <p className="mt-1 truncate text-[11px] font-semibold opacity-50">
                              {config.airtelReceiverName || "Registered name"}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Copy Airtel number"
                          onClick={() => {
                            navigator.clipboard.writeText(config.airtelReceiverPhone);
                            toast.success("Airtel number copied");
                          }}
                          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-bg)] transition-colors hover:border-[var(--theme-primary)]/40"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-[var(--theme-card-border)] p-3.5 text-[11px] font-bold opacity-45">
                        Airtel receiving is paused
                      </div>
                    )}
                  </div>

                  {/* The exact figure the receiver must see. Copying it beats
                      retyping it, and a mismatched amount is the most common
                      reason a manual transfer is rejected. */}
                  <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--theme-primary)]/25 bg-[var(--theme-primary)]/[0.07] px-3.5 py-3">
                    <div>
                      <p className="text-[10px] font-sans font-bold uppercase leading-none tracking-[0.1em] text-[var(--theme-text)] opacity-50">
                        Send exactly
                      </p>
                      <p className="mt-1.5 text-[17px] font-black leading-none tabular-nums text-[var(--theme-primary)]">
                        {formatCurrency(finalAmount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(String(finalAmount));
                        toast.success("Amount copied");
                      }}
                      className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--theme-primary)]/30 bg-[var(--theme-card-bg)] px-3 text-[11px] font-black text-[var(--theme-primary)] transition-colors hover:bg-[var(--theme-primary)]/10"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </button>
                  </div>
                </div>`
);

replaceOnce(
  "manual fields",
  `                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <label className="text-[13px] font-sans font-medium opacity-60">Your sender number</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] px-2.5 py-1 text-[11px] font-black">+256</span>
                      <input
                        type="text"
                        required
                        placeholder="7XX XXX XXX"
                        value={senderPhone}
                        onChange={(e) => setSenderPhone(e.target.value)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-[72px] pr-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-sans font-medium opacity-60">Amount sent (UGX)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black opacity-50">UGX</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        disabled={payType === "gpu"}
                        value={payType === "gpu" ? selectedGpu?.amount || 0 : manualAmount}
                        onChange={(e) => setManualAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-12 pr-4 text-[15px] font-black outline-none disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-sans font-medium opacity-60">Transaction ID</label>
                    <input
                      type="text"
                      required
                      placeholder="Paste mobile money TxID"
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 px-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40"
                    />
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  type="submit"
                  loading={isSubmitting}
                  disabled={payType === "gpu" && !selectedGpu}
                  className="w-full"
                >
                  <span>Submit proof �? {formatCurrency(finalAmount)}</span>
                </Button>
                <p className="text-center text-xs font-sans font-medium opacity-60">
                  {formatCurrency(minimumDeposit)} min{maximumDeposit > 0 ? \` �? \${formatCurrency(maximumDeposit)} max\` : " �? no max"}
                </p>
              </form>`,
  `                <div className="space-y-4">
                  <Field label="Amount sent (UGX)">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-black opacity-40">UGX</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        disabled={payType === "gpu"}
                        value={payType === "gpu" ? selectedGpu?.amount || 0 : manualAmount}
                        onChange={(e) => setManualAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        className={\`\${inputCls} py-4 pl-14 text-[22px] font-black tabular-nums tracking-tight\`}
                      />
                    </div>
                  </Field>

                  <Field label="Sender number" hint="The wallet you sent from — it has to match the transfer.">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-2 py-1 text-[11px] font-black">
                        +256
                      </span>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="7XX XXX XXX"
                        value={senderPhone}
                        onChange={(e) => setSenderPhone(e.target.value)}
                        className={\`\${inputCls} pl-[68px]\`}
                      />
                    </div>
                  </Field>

                  <Field label="Transaction ID" hint="The SMS your wallet sends after the transfer.">
                    <input
                      type="text"
                      required
                      placeholder="e.g. MP2410..."
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      className={\`\${inputCls} font-mono text-[14px]\`}
                    />
                  </Field>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  type="submit"
                  loading={isSubmitting}
                  disabled={payType === "gpu" && !selectedGpu}
                  className="w-full"
                >
                  <span>Submit for review · {formatCurrency(finalAmount)}</span>
                </Button>
                <p className="text-center text-[11px] font-sans font-medium opacity-45">
                  Reviewed manually, usually within 5�C15 minutes. You will see the result in History.
                </p>
              </form>`
);

fs.writeFileSync(FILE, src);
console.log("OK: auto + manual forms rebuilt");