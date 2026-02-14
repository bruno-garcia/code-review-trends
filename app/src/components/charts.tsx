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
} from "recharts";

const COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

function formatWeek(week: string | number) {
  const d = new Date(String(week));
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

type BotShareData = {
  week: string;
  bot_reviews: number;
  human_reviews: number;
  bot_share_pct: number;
  bot_comments: number;
  human_comments: number;
  bot_comment_share_pct: number;
};

type MetricOption = "reviews" | "comments";

export function BotShareChart({ data }: { data: BotShareData[] }) {
  const [metric, setMetric] = useState<MetricOption>("reviews");

  const dataKey = metric === "reviews" ? "bot_share_pct" : "bot_comment_share_pct";
  const label = metric === "reviews" ? "PR Reviews" : "Review Comments";

  return (
    <div>
      <div className="flex gap-1 mb-4" data-testid="ai-share-toggle">
        <button
          onClick={() => setMetric("reviews")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            metric === "reviews"
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
          data-testid="toggle-reviews"
        >
          PR Reviews
        </button>
        <button
          onClick={() => setMetric("comments")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            metric === "comments"
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
          data-testid="toggle-comments"
        >
          Review Comments
        </button>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="week"
            tickFormatter={formatWeek}
            stroke="#9ca3af"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke="#9ca3af"
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: 8,
            }}
            labelFormatter={(v) => formatWeek(String(v))}
            formatter={(value) => [`${Number(value).toFixed(2)}%`, `AI Share (${label})`]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke="#6366f1"
            fill="#6366f1"
            fillOpacity={0.3}
            name={`AI Share (${label})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

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
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="week"
          tickFormatter={formatWeek}
          stroke="#9ca3af"
          tick={{ fontSize: 12 }}
        />
        <YAxis
          stroke="#9ca3af"
          tick={{ fontSize: 12 }}
          tickFormatter={formatNumber}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: 8,
          }}
          labelFormatter={(v) => formatWeek(String(v))}
          formatter={(value, name) => [
            formatNumber(Number(value)),
            name,
          ]}
        />
        <Legend />
        {bots.map((bot, i) => (
          <Area
            key={bot}
            type="monotone"
            dataKey={bot}
            stackId="1"
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.6}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

type SingleBotData = {
  week: string;
  review_count: number;
  review_comment_count: number;
  repo_count: number;
};

export function SingleBotChart({ data }: { data: SingleBotData[] }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="week"
          tickFormatter={formatWeek}
          stroke="#9ca3af"
          tick={{ fontSize: 12 }}
        />
        <YAxis
          stroke="#9ca3af"
          tick={{ fontSize: 12 }}
          tickFormatter={formatNumber}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: 8,
          }}
          labelFormatter={(v) => formatWeek(String(v))}
          formatter={(value, name) => [
            formatNumber(Number(value)),
            name,
          ]}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="review_count"
          stroke="#6366f1"
          name="Reviews"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="review_comment_count"
          stroke="#10b981"
          name="Comments"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="repo_count"
          stroke="#f59e0b"
          name="Repos"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

type ReactionData = {
  week: string;
  thumbs_up: number;
  thumbs_down: number;
  heart: number;
};

export function ReactionChart({ data }: { data: ReactionData[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="week"
          tickFormatter={formatWeek}
          stroke="#9ca3af"
          tick={{ fontSize: 12 }}
        />
        <YAxis
          stroke="#9ca3af"
          tick={{ fontSize: 12 }}
          tickFormatter={formatNumber}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: 8,
          }}
          labelFormatter={(v) => formatWeek(String(v))}
        />
        <Legend />
        <Bar dataKey="thumbs_up" fill="#10b981" name="👍" stackId="a" />
        <Bar dataKey="heart" fill="#ec4899" name="❤️" stackId="a" />
        <Bar dataKey="thumbs_down" fill="#ef4444" name="👎" stackId="a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
