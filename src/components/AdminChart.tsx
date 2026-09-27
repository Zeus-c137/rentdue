import React, { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useCurrency } from "../currency";
import { canonicalTypeOf } from "../utils/transactionMeta";

interface AdminChartProps {
  transactionsList: any[];
}

export default function AdminChart({ transactionsList }: AdminChartProps) {
  const { formatCurrency } = useCurrency();
  const [activeChart, setActiveChart] = useState<"all" | "deposit" | "withdraw">("all");
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d" | "all">("90d");

  // Filter transaction list by date range
  const filteredTransactions = useMemo(() => {
    if (timeRange === "all") return transactionsList;

    const daysToSubtract = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToSubtract);
    cutoffDate.setHours(0, 0, 0, 0);

    return transactionsList.filter((tx) => {
      const rawDate = tx.timestamp || tx.createdAt || tx.date;
      if (!rawDate) return false;
      const txDate = new Date(rawDate);
      return !isNaN(txDate.getTime()) && txDate >= cutoffDate;
    });
  }, [transactionsList, timeRange]);

  // Aggregate daily deposit and withdrawal totals
  const chartData = useMemo(() => {
    const dailyData: Record<string, { date: string; deposit: number; withdraw: number }> = {};

    filteredTransactions.forEach((tx) => {
      const rawDate = tx.timestamp || tx.createdAt || tx.date;
      if (!rawDate) return;
      
      const st = (tx.status || "").toUpperCase();
      if (st !== "SUCCESSFUL" && st !== "COMPLETED" && st !== "APPROVED") return;

      const dateObj = new Date(rawDate);
      if (isNaN(dateObj.getTime())) return;
      const dateStr = dateObj.toLocaleDateString("en-CA"); // YYYY-MM-DD

      if (!dailyData[dateStr]) {
        dailyData[dateStr] = { date: dateStr, deposit: 0, withdraw: 0 };
      }

      const amount = Number(tx.amount) || 0;
      const canon = canonicalTypeOf(tx.type, tx.metadata) as string;
      const isWithdraw = canon === "withdrawal";
      const isDeposit = canon === "deposit";

      if (isWithdraw) {
        dailyData[dateStr].withdraw += amount;
      } else if (isDeposit) {
        dailyData[dateStr].deposit += amount;
      }
    });

    return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredTransactions]);

  const totals = useMemo(() => ({
    deposit: chartData.reduce((acc, curr) => acc + curr.deposit, 0),
    withdraw: chartData.reduce((acc, curr) => acc + curr.withdraw, 0),
  }), [chartData]);

  return (
    <div className="bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] shadow-md overflow-hidden w-full font-sans transition-all">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-[var(--theme-card-border)] p-4 sm:p-5 gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--theme-text)] font-display">
            Transactions Overview
          </h2>
        </div>

        {/* Date Filter Selector & Metric View Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="theme-input px-3 py-1.5 text-xs font-bold rounded-[var(--theme-radius)] cursor-pointer outline-none border border-[var(--theme-card-border)] bg-[var(--theme-bg)] text-[var(--theme-text)]"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>

          {/* Metric View Select */}
          <select
            value={activeChart}
            onChange={(e) => setActiveChart(e.target.value as any)}
            className="theme-input px-3 py-1.5 text-xs font-bold rounded-[var(--theme-radius)] cursor-pointer outline-none border border-[var(--theme-card-border)] bg-[var(--theme-bg)] text-[var(--theme-text)]"
          >
            <option value="all">All</option>
            <option value="deposit">Deposits</option>
            <option value="withdraw">Withdraws</option>
          </select>
        </div>
      </div>

      {/* Overview Stat Badges */}
      <div className="grid grid-cols-2 divide-x divide-[var(--theme-card-border)] border-b border-[var(--theme-card-border)] bg-[var(--theme-bg)]/40 text-xs font-sans">
        <div className="p-4 space-y-0.5">
          <span className="text-[10px] uppercase tracking-wider text-[var(--theme-text)] opacity-60 font-semibold block">Total Deposits</span>
          <span className="text-sm sm:text-base font-extrabold text-[var(--theme-primary)]">
            {formatCurrency(totals.deposit)}
          </span>
        </div>
        <div className="p-4 space-y-0.5">
          <span className="text-[10px] uppercase tracking-wider text-[var(--theme-text)] opacity-60 font-semibold block">Total Cashout</span>
          <span className="text-sm sm:text-base font-extrabold text-[var(--theme-accent)]">
            {formatCurrency(totals.withdraw)}
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="p-4 sm:p-6">
        <div className="aspect-auto h-[260px] w-full">
          {chartData.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-xs text-[var(--theme-text)] opacity-50 gap-2">
              <span className="text-2xl">📊</span>
              No transactions recorded for this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillDeposit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--theme-primary)" stopOpacity={0.65} />
                    <stop offset="95%" stopColor="var(--theme-primary)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fillWithdraw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--theme-accent)" stopOpacity={0.65} />
                    <stop offset="95%" stopColor="var(--theme-accent)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--theme-card-border)" strokeDasharray="3 3" opacity={0.6} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  stroke="var(--theme-text)"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val) => {
                    const date = new Date(val);
                    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }}
                />
                <Tooltip
                  cursor={{ stroke: "var(--theme-card-border)", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-3 rounded-xl shadow-xl text-[var(--theme-text)] font-sans space-y-1 text-xs">
                          <p className="opacity-70 font-semibold border-b border-[var(--theme-card-border)] pb-1 mb-1">
                            {new Date(label).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric"
                            })}
                          </p>
                          {payload.map((entry: any) => (
                            <div key={entry.dataKey} className="flex items-center justify-between gap-4 font-bold">
                              <span className="flex items-center gap-1.5 capitalize" style={{ color: entry.color }}>
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                {entry.dataKey === "deposit" ? "Deposit" : "Withdrawal"}:
                              </span>
                              <span>{formatCurrency(Number(entry.value))}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {(activeChart === "all" || activeChart === "deposit") && (
                  <Area
                    dataKey="deposit"
                    type="natural"
                    fill="url(#fillDeposit)"
                    stroke="var(--theme-primary)"
                    strokeWidth={2.5}
                    stackId={activeChart === "all" ? undefined : "a"}
                  />
                )}
                {(activeChart === "all" || activeChart === "withdraw") && (
                  <Area
                    dataKey="withdraw"
                    type="natural"
                    fill="url(#fillWithdraw)"
                    stroke="var(--theme-accent)"
                    strokeWidth={2.5}
                    stackId={activeChart === "all" ? undefined : "a"}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
