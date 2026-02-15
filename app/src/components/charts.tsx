"use client";

import { useState } from "react";
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
import { THEME } from "@/lib/theme";

export { COLORS } from "@/lib/colors";
import { COLORS } from "@/lib/colors";

function formatWeek(week: string | number) {
  const d = new Date(String(week));
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const TOOLTIP_STYLE = {
  backgroundColor: THEME.tooltipBg,
  border: `1px solid ${THEME.border}`,
  borderRadius: 8,
};

const GRID_COLOR = THEME.grid;
const AXIS_COLOR = THEME.axis;
const LEGEND_STYLE = { color: THEME.mutedText };

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
              : "bg-theme-border text-gray-400 hover:text-white"
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
};

export function BotShareChart({ data }: { data: BotShareData[] }) {
  const [metric, setMetric] = useState("reviews");

  const dataKey =
    metric === "reviews" ? "bot_share_pct" : "bot_comment_share_pct";
  const label = metric === "reviews" ? "PR Reviews" : "Review Comments";

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
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis
            dataKey="week"
            tickFormatter={formatWeek}
            stroke={AXIS_COLOR}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke={AXIS_COLOR}
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(v) => formatWeek(String(v))}
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
  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis
          dataKey="week"
          tickFormatter={formatWeek}
          stroke={AXIS_COLOR}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          stroke={AXIS_COLOR}
          tick={{ fontSize: 12 }}
          tickFormatter={formatNumber}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(v) => formatWeek(String(v))}
          formatter={(value, name) => [formatNumber(Number(value)), name]}
        />
        <Legend wrapperStyle={LEGEND_STYLE} />
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
  repo_count: number;
  org_count: number;
};

export function SingleBotChart({ data }: { data: SingleBotData[] }) {
  const [metric, setMetric] = useState("reviews");

  const lines: Record<string, { keys: string[]; colors: string[]; names: string[] }> = {
    reviews: {
      keys: ["review_count", "review_comment_count"],
      colors: ["#a78bfa", "#22d3ee"],
      names: ["Reviews", "Comments"],
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
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis
            dataKey="week"
            tickFormatter={formatWeek}
            stroke={AXIS_COLOR}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke={AXIS_COLOR}
            tick={{ fontSize: 12 }}
            tickFormatter={formatNumber}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(v) => formatWeek(String(v))}
            formatter={(value, name) => [formatNumber(Number(value)), name]}
          />
          <Legend wrapperStyle={LEGEND_STYLE} />
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

// --- Reaction chart ---

type ReactionData = {
  week: string;
  thumbs_up: number;
  thumbs_down: number;
  heart: number;
  laugh: number;
  confused: number;
};

export function ReactionChart({ data }: { data: ReactionData[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis
          dataKey="week"
          tickFormatter={formatWeek}
          stroke={AXIS_COLOR}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          stroke={AXIS_COLOR}
          tick={{ fontSize: 12 }}
          tickFormatter={formatNumber}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => formatWeek(String(v))} />
        <Legend wrapperStyle={LEGEND_STYLE} />
        <Bar dataKey="thumbs_up" fill="#10b981" name="👍" stackId="a" />
        <Bar dataKey="heart" fill="#ec4899" name="❤️" stackId="a" />
        <Bar dataKey="laugh" fill="#f59e0b" name="😄" stackId="a" />
        <Bar dataKey="confused" fill="#8b5cf6" name="😕" stackId="b" />
        <Bar dataKey="thumbs_down" fill="#ef4444" name="👎" stackId="b" />
      </BarChart>
    </ResponsiveContainer>
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
  return (
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={data}>
        <PolarGrid stroke={GRID_COLOR} />
        <PolarAngleAxis
          dataKey="metric"
          stroke={AXIS_COLOR}
          tick={{ fontSize: 11 }}
        />
        <PolarRadiusAxis
          stroke="#2a2a3a"
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
        <Legend wrapperStyle={LEGEND_STYLE} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </RadarChart>
    </ResponsiveContainer>
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
  if (data.length === 0) {
    return <div data-testid="bot-reaction-leaderboard"><p className="text-gray-500 text-sm">No data</p></div>;
  }
  return (
    <div data-testid="bot-reaction-leaderboard">
      <ResponsiveContainer width="100%" height={data.length * 44 + 40}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
          <XAxis
            type="number"
            stroke="#9ca3af"
            tick={{ fontSize: 12 }}
            tickFormatter={formatNumber}
          />
          <YAxis
            type="category"
            dataKey="bot_name"
            stroke="#9ca3af"
            tick={{ fontSize: 12 }}
            width={130}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
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
  if (data.length === 0) {
    return <div data-testid="bot-language-chart"><p className="text-gray-500 text-sm">No data</p></div>;
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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="language"
            stroke="#9ca3af"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke="#9ca3af"
            tick={{ fontSize: 12 }}
            tickFormatter={formatNumber}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend />
          {bots.map((bot, i) => (
            <Bar key={bot} dataKey={bot} fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Reactions by PR Size Chart ---

type ReactionsByPRSizeData = {
  size_bucket: string;
  avg_thumbs_up: number;
  avg_thumbs_down: number;
  pr_count: number;
};

const SIZE_ORDER = ["XS", "S", "M", "L", "XL"];

export function ReactionsByPRSizeChart({
  data,
}: {
  data: ReactionsByPRSizeData[];
}) {
  if (data.length === 0) {
    return <div data-testid="reactions-by-pr-size"><p className="text-gray-500 text-sm">No data</p></div>;
  }

  const sorted = [...data].sort(
    (a, b) => SIZE_ORDER.indexOf(a.size_bucket) - SIZE_ORDER.indexOf(b.size_bucket),
  );

  return (
    <div data-testid="reactions-by-pr-size">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={sorted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="size_bucket" stroke="#9ca3af" tick={{ fontSize: 12 }} />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [
              Number(value).toFixed(2),
              name === "avg_thumbs_up" ? "Avg 👍" : "Avg 👎",
            ]}
          />
          <Legend
            formatter={(value) =>
              value === "avg_thumbs_up" ? "Avg 👍" : "Avg 👎"
            }
          />
          <Bar dataKey="avg_thumbs_up" fill="#10b981" name="avg_thumbs_up" />
          <Bar dataKey="avg_thumbs_down" fill="#ef4444" name="avg_thumbs_down" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Top Orgs Chart (horizontal bar) ---

type TopOrgData = {
  owner: string;
  total_stars: number;
  repo_count: number;
};

export function TopOrgsChart({ data }: { data: TopOrgData[] }) {
  if (data.length === 0) {
    return <div data-testid="top-orgs-chart"><p className="text-gray-500 text-sm">No data</p></div>;
  }

  const top20 = data.slice(0, 20);

  return (
    <div data-testid="top-orgs-chart">
      <ResponsiveContainer width="100%" height={top20.length * 44 + 40}>
        <BarChart data={top20} layout="vertical" margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
          <XAxis
            type="number"
            stroke="#9ca3af"
            tick={{ fontSize: 12 }}
            tickFormatter={formatNumber}
          />
          <YAxis
            type="category"
            dataKey="owner"
            stroke="#9ca3af"
            tick={{ fontSize: 12 }}
            width={130}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [
              formatNumber(Number(value)),
              name === "total_stars" ? "⭐ Stars" : "Repos",
            ]}
          />
          <Legend
            formatter={(value) =>
              value === "total_stars" ? "⭐ Stars" : "Repos"
            }
          />
          <Bar dataKey="total_stars" fill="#f59e0b" name="total_stars" />
        </BarChart>
      </ResponsiveContainer>
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
  if (data.length === 0) {
    return <div data-testid="comments-per-pr-chart"><p className="text-gray-500 text-sm">No data</p></div>;
  }

  return (
    <div data-testid="comments-per-pr-chart">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="bot_name" stroke="#9ca3af" tick={{ fontSize: 12 }} />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
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
  const fmt = formatter ?? formatNumber;
  return (
    <ResponsiveContainer width="100%" height={data.length * 44 + 40}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
        <XAxis
          type="number"
          stroke={AXIS_COLOR}
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => fmt(v)}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke={AXIS_COLOR}
          tick={{ fontSize: 12 }}
          width={130}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
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
