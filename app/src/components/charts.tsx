"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  BarChart,
  Bar,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { useTheme } from "@/components/theme-provider";

export { COLORS } from "@/lib/colors";
import { COLORS } from "@/lib/colors";
import { formatNumber } from "@/lib/format";

function formatWeek(week: string | number) {
  const d = new Date(String(week));
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatWeekLong(week: string | number) {
  const d = new Date(String(week));
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Ensure the tooltip popup renders above the Legend overlay. */
const TOOLTIP_WRAPPER_STYLE: React.CSSProperties = { zIndex: 10 };
const MAX_BAR_SIZE = 80;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const descendingItemSorter = (item: any) => -(Number(item.value) || 0);

/** Hook that returns chart colors reactive to theme changes */
function useChartColors() {
  const { resolved } = useTheme();
  return useMemo(() => {
    const isDark = resolved === "dark";
    return {
      grid: isDark ? "#1e1e2e" : "#e5e7eb",
      axis: isDark ? "#555555" : "#9ca3af",
      muted: isDark ? "#9ca3af" : "#6b7280",
      tooltipStyle: {
        backgroundColor: isDark ? "#12121a" : "#ffffff",
        border: `1px solid ${isDark ? "#1e1e2e" : "#e5e7eb"}`,
        borderRadius: 8,
        color: isDark ? "#f3f4f6" : "#111827",
      },
      legendStyle: { color: isDark ? "#9ca3af" : "#6b7280" },
      cartesianGrid: isDark ? "#374151" : "#e5e7eb",
      barAxis: isDark ? "#9ca3af" : "#6b7280",
      polarRadius: isDark ? "#2a2a3a" : "#d1d5db",
    };
  }, [resolved]);
}

// --- Toggle button group ---

type ToggleOption = { value: string; label: string };

function ToggleGroup({
  options,
  value,
  onChange,
  testId,
}: {
  options: ToggleOption[];
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div className="flex gap-1 mb-4" data-testid={testId}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            value === opt.value
              ? "bg-violet-600 text-white"
              : "bg-theme-border text-theme-muted hover:text-theme-text"
          }`}
          aria-pressed={value === opt.value}
          data-testid={`toggle-${opt.value}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// --- AI Share Chart ---

type BotShareData = {
  week: string;
  bot_reviews: number;
  human_reviews: number;
  bot_share_pct: number;
  bot_comments: number;
  human_comments: number;
  bot_comment_share_pct: number;
  bot_pr_comments: number;
  human_pr_comments: number;
  bot_pr_comment_share_pct: number;
};

export function BotShareChart({ data }: { data: BotShareData[] }) {
  const [metric, setMetric] = useState("reviews");
  const c = useChartColors();

  const metricConfig: Record<string, { dataKey: keyof BotShareData; label: string }> = {
    reviews: { dataKey: "bot_share_pct", label: "PR Reviews" },
    comments: { dataKey: "bot_comment_share_pct", label: "Review Comments" },
  };

  const { dataKey, label } = metricConfig[metric];

  return (
    <div>
      <ToggleGroup
        options={[
          { value: "reviews", label: "PR Reviews" },
          { value: "comments", label: "Review Comments" },
        ]}
        value={metric}
        onChange={setMetric}
        testId="ai-share-toggle"
      />
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
          <XAxis
            dataKey="week"
            tickFormatter={formatWeek}
            stroke={c.axis}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke={c.axis}
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={c.tooltipStyle}
            labelFormatter={(v) => formatWeekLong(String(v))}
            formatter={(value) => [
              `${Number(value).toFixed(2)}%`,
              `AI Share (${label})`,
            ]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke="#a78bfa"
            fill="#a78bfa"
            fillOpacity={0.2}
            name={`AI Share (${label})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Total AI Volume Chart ---

type TotalVolumeData = {
  week: string;
  total_reviews: number;
  total_comments: number;
  total_pr_comments: number;
};

export function TotalVolumeChart({ data }: { data: TotalVolumeData[] }) {
  const [metric, setMetric] = useState("reviews");
  const c = useChartColors();

  const metricConfig: Record<string, { dataKey: keyof TotalVolumeData; label: string; color: string }> = {
    reviews: { dataKey: "total_reviews", label: "Reviews", color: "#a78bfa" },
    comments: { dataKey: "total_comments", label: "Review Comments", color: "#22d3ee" },
  };

  const { dataKey, label, color } = metricConfig[metric];

  return (
    <div data-testid="total-volume-chart">
      <ToggleGroup
        options={[
          { value: "reviews", label: "Reviews" },
          { value: "comments", label: "Review Comments" },
        ]}
        value={metric}
        onChange={setMetric}
        testId="total-volume-toggle"
      />
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
          <XAxis
            dataKey="week"
            tickFormatter={formatWeek}
            stroke={c.axis}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke={c.axis}
            tick={{ fontSize: 12 }}
            tickFormatter={formatNumber}
          />
          <Tooltip
            contentStyle={c.tooltipStyle}
            labelFormatter={(v) => formatWeekLong(String(v))}
            formatter={(value) => [formatNumber(Number(value)), label]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={color}
            fillOpacity={0.2}
            name={label}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Stacked review volume ---

export function ReviewVolumeChart({
  data,
  bots,
  colors,
}: {
  data: Record<string, string | number>[];
  bots: string[];
  colors?: Record<string, string>;
}) {
  const c = useChartColors();

  if (data.length === 0) {
    return <p className="text-theme-muted text-sm">No review data for the selected filters.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
        <XAxis
          dataKey="week"
          tickFormatter={formatWeek}
          stroke={c.axis}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          stroke={c.axis}
          tick={{ fontSize: 12 }}
          tickFormatter={formatNumber}
        />
        <Tooltip
          contentStyle={c.tooltipStyle}
          wrapperStyle={TOOLTIP_WRAPPER_STYLE}
          labelFormatter={(v) => formatWeekLong(String(v))}
          formatter={(value, name) => [formatNumber(Number(value)), name]}
          itemSorter={descendingItemSorter}
        />
        <Legend wrapperStyle={c.legendStyle} />
        {bots.map((bot, i) => {
          const color = colors?.[bot] ?? COLORS[i % COLORS.length];
          return (
            <Area
              key={bot}
              type="monotone"
              dataKey={bot}
              stackId="1"
              stroke={color}
              fill={color}
              fillOpacity={0.5}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// --- Single bot activity ---

type SingleBotData = {
  week: string;
  review_count: number;
  review_comment_count: number;
  pr_comment_count: number;
  repo_count: number;
  org_count: number;
};

export function SingleBotChart({ data }: { data: SingleBotData[] }) {
  const [metric, setMetric] = useState("reviews");
  const c = useChartColors();

  const lines: Record<string, { keys: string[]; colors: string[]; names: string[] }> = {
    reviews: {
      keys: ["review_count", "review_comment_count"],
      colors: ["#a78bfa", "#22d3ee"],
      names: ["Reviews", "Review Comments"],
    },
    repos: {
      keys: ["repo_count", "org_count"],
      colors: ["#f59e0b", "#10b981"],
      names: ["Repos", "Organizations"],
    },
  };

  const current = lines[metric];

  return (
    <div>
      <ToggleGroup
        options={[
          { value: "reviews", label: "Reviews & Comments" },
          { value: "repos", label: "Repos & Orgs" },
        ]}
        value={metric}
        onChange={setMetric}
        testId="bot-activity-toggle"
      />
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
          <XAxis
            dataKey="week"
            tickFormatter={formatWeek}
            stroke={c.axis}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke={c.axis}
            tick={{ fontSize: 12 }}
            tickFormatter={formatNumber}
          />
          <Tooltip
            contentStyle={c.tooltipStyle}
            wrapperStyle={TOOLTIP_WRAPPER_STYLE}
            labelFormatter={(v) => formatWeekLong(String(v))}
            formatter={(value, name) => [formatNumber(Number(value)), name]}
          />
          <Legend wrapperStyle={c.legendStyle} />
          {current.keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={current.colors[i]}
              name={current.names[i]}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Radar comparison chart ---

export function BotRadarChart({
  data,
  bots,
  colors,
}: {
  data: Record<string, string | number>[];
  bots: string[];
  colors?: Record<string, string>;
}) {
  const c = useChartColors();

  return (
    <div>
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={data}>
          <PolarGrid stroke={c.grid} />
          <PolarAngleAxis
            dataKey="metric"
            stroke={c.axis}
            tick={{ fontSize: 11 }}
          />
          <PolarRadiusAxis
            stroke={c.polarRadius}
            tick={{ fontSize: 10 }}
            domain={[0, 100]}
            tickCount={5}
          />
          {bots.map((bot, i) => {
            const color = colors?.[bot] ?? COLORS[i % COLORS.length];
            return (
              <Radar
                key={bot}
                name={bot}
                dataKey={bot}
                stroke={color}
                fill={color}
                fillOpacity={0.15}
              />
            );
          })}
          <Tooltip contentStyle={c.tooltipStyle} wrapperStyle={TOOLTIP_WRAPPER_STYLE} itemSorter={descendingItemSorter} />
        </RadarChart>
      </ResponsiveContainer>
      {/* Legend rendered outside the chart so it never overlaps the radar */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2" style={c.legendStyle}>
        {bots.map((bot, i) => {
          const color = colors?.[bot] ?? COLORS[i % COLORS.length];
          return (
            <div key={bot} className="flex items-center gap-1.5 text-sm">
              <span
                className="inline-block w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: color }}
              />
              <span>{bot}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Bot Reaction Leaderboard (horizontal stacked bar) ---

type BotReactionLeaderboardData = {
  bot_id: string;
  bot_name: string;
  total_thumbs_up: number;
  total_thumbs_down: number;
  total_heart: number;
  total_comments: number;
  approval_rate: number;
};

export function BotReactionLeaderboardChart({
  data,
}: {
  data: BotReactionLeaderboardData[];
}) {
  const c = useChartColors();

  if (data.length === 0) {
    return <div data-testid="bot-reaction-leaderboard"><p className="text-theme-muted text-sm">No data</p></div>;
  }
  return (
    <div data-testid="bot-reaction-leaderboard">
      <ResponsiveContainer width="100%" height={data.length * 44 + 40}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.cartesianGrid} horizontal={false} />
          <XAxis
            type="number"
            stroke={c.barAxis}
            tick={{ fontSize: 12 }}
            tickFormatter={formatNumber}
          />
          <YAxis
            type="category"
            dataKey="bot_name"
            stroke={c.barAxis}
            tick={{ fontSize: 12 }}
            width={130}
          />
          <Tooltip cursor={false} contentStyle={c.tooltipStyle} wrapperStyle={TOOLTIP_WRAPPER_STYLE} />
          <Legend />
          <Bar dataKey="total_thumbs_up" fill="#10b981" name="👍" stackId="a" />
          <Bar dataKey="total_heart" fill="#ec4899" name="❤️" stackId="a" />
          <Bar dataKey="total_thumbs_down" fill="#ef4444" name="👎" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Bot Language Chart (grouped bar) ---

type BotLanguageData = {
  bot_id: string;
  bot_name: string;
  language: string;
  pr_count: number;
  comment_count: number;
};

export function BotLanguageChart({ data }: { data: BotLanguageData[] }) {
  const c = useChartColors();

  if (data.length === 0) {
    return <div data-testid="bot-language-chart"><p className="text-theme-muted text-sm">No data</p></div>;
  }

  // Pivot: top 10 languages, bots as grouped bars
  const langTotals = new Map<string, number>();
  for (const d of data) {
    langTotals.set(d.language, (langTotals.get(d.language) ?? 0) + d.pr_count);
  }
  const topLangs = [...langTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([lang]) => lang);

  const bots = [...new Set(data.map((d) => d.bot_name))];

  const chartData = topLangs.map((lang) => {
    const row: Record<string, string | number> = { language: lang };
    for (const bot of bots) {
      const match = data.find((d) => d.language === lang && d.bot_name === bot);
      row[bot] = match?.pr_count ?? 0;
    }
    return row;
  });

  return (
    <div data-testid="bot-language-chart">
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.cartesianGrid} />
          <XAxis
            dataKey="language"
            stroke={c.barAxis}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke={c.barAxis}
            tick={{ fontSize: 12 }}
            tickFormatter={formatNumber}
          />
          <Tooltip cursor={false} contentStyle={c.tooltipStyle} wrapperStyle={TOOLTIP_WRAPPER_STYLE} />
          <Legend />
          {bots.map((bot, i) => (
            <Bar key={bot} dataKey={bot} fill={COLORS[i % COLORS.length]} maxBarSize={MAX_BAR_SIZE} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Top Orgs Table ---

type TopOrgData = {
  owner: string;
  total_stars: number;
  repo_count: number;
};

export function TopOrgsChart({ data }: { data: TopOrgData[] }) {
  if (data.length === 0) {
    return <div data-testid="top-orgs-chart"><p className="text-theme-muted text-sm">No data</p></div>;
  }

  const top20 = data.slice(0, 20);
  const maxStars = Math.max(...top20.map((d) => Number(d.total_stars)));

  return (
    <div data-testid="top-orgs-chart">
      <div className="space-y-3">
        {top20.map((org, i) => {
          const stars = Number(org.total_stars);
          const pct = maxStars > 0 ? (stars / maxStars) * 100 : 0;
          return (
            <Link
              key={org.owner}
              href={`/orgs/${org.owner}`}
              className="flex items-center gap-2 sm:gap-4 group"
            >
              <span className="text-theme-muted text-sm w-6 text-right shrink-0 tabular-nums">
                {i + 1}
              </span>
              <img
                src={`https://github.com/${org.owner}.png?size=40`}
                alt={org.owner}
                width={28}
                height={28}
                className="rounded-full bg-theme-surface shrink-0"
              />
              <span className="text-base font-medium text-theme-text group-hover:text-indigo-400 group-hover:underline transition-colors w-24 sm:w-32 shrink-0 truncate">
                {org.owner}
              </span>
              <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="flex-1 h-6 bg-theme-border/40 rounded overflow-hidden">
                  <div
                    className="h-full bg-amber-500/70 rounded transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm text-theme-muted tabular-nums shrink-0 whitespace-nowrap text-right">
                  ⭐ {formatNumber(stars)}
                </span>
                <span className="hidden sm:inline text-sm text-theme-muted/70 tabular-nums shrink-0 w-20 text-right">
                  {Number(org.repo_count)} {Number(org.repo_count) === 1 ? "repo" : "repos"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// --- Comments Per PR Chart ---

type CommentsPerPRData = {
  bot_id: string;
  bot_name: string;
  avg_comments_per_pr: number;
  total_prs: number;
  total_comments: number;
};

export function CommentsPerPRChart({ data }: { data: CommentsPerPRData[] }) {
  const c = useChartColors();

  if (data.length === 0) {
    return <div data-testid="comments-per-pr-chart"><p className="text-theme-muted text-sm">No data</p></div>;
  }

  return (
    <div data-testid="comments-per-pr-chart">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.cartesianGrid} />
          <XAxis dataKey="bot_name" stroke={c.barAxis} tick={{ fontSize: 12 }} />
          <YAxis stroke={c.barAxis} tick={{ fontSize: 12 }} />
          <Tooltip
            cursor={false}
            contentStyle={c.tooltipStyle}
            formatter={(value) => [
              Number(value).toFixed(2),
              "Avg Comments/PR",
            ]}
          />
          <Bar dataKey="avg_comments_per_pr" fill="#6366f1" name="Avg Comments/PR">
            {data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Horizontal bar chart for comparisons ---

type CompareBarData = {
  name: string;
  value: number;
  color: string;
};

export function CompareBarChart({
  data,
  label,
  formatter,
}: {
  data: CompareBarData[];
  label: string;
  formatter?: (v: number) => string;
}) {
  const c = useChartColors();
  const fmt = formatter ?? formatNumber;

  return (
    <ResponsiveContainer width="100%" height={data.length * 44 + 40}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
        <XAxis
          type="number"
          stroke={c.axis}
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => fmt(v)}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke={c.axis}
          tick={{ fontSize: 12 }}
          width={130}
        />
        <Tooltip
          cursor={false}
          contentStyle={c.tooltipStyle}
          formatter={(value) => [fmt(Number(value)), label]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={`cell-${i}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
