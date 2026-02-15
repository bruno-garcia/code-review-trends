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
}: {
  data: Record<string, string | number>[];
  bots: string[];
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
        {bots.map((bot, i) => (
          <Area
            key={bot}
            type="monotone"
            dataKey={bot}
            stackId="1"
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.5}
          />
        ))}
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
}: {
  data: Record<string, string | number>[];
  bots: string[];
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
        {bots.map((bot, i) => (
          <Radar
            key={bot}
            name={bot}
            dataKey={bot}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.15}
          />
        ))}
        <Legend wrapperStyle={LEGEND_STYLE} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </RadarChart>
    </ResponsiveContainer>
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
