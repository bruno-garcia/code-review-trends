import type { MetadataRoute } from "next";
import { getProductSummaries, getOrgList } from "@/lib/clickhouse";

const BASE_URL = "https://codereviewtrends.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // Static pages
  entries.push(
    { url: BASE_URL, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/bots`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/compare`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/orgs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/status`, changeFrequency: "daily", priority: 0.4 },
  );

  // Dynamic product pages
  try {
    const products = await getProductSummaries();
    for (const product of products) {
      entries.push({
        url: `${BASE_URL}/bots/${product.id}`,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch {
    // ClickHouse unavailable — skip dynamic entries
  }

  // Top organization pages (limit to top 500 by stars to keep sitemap reasonable)
  try {
    const result = await getOrgList({ sort: "stars", limit: 500, offset: 0 });
    for (const org of result.orgs) {
      entries.push({
        url: `${BASE_URL}/orgs/${encodeURIComponent(org.owner)}`,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch {
    // ClickHouse unavailable — skip dynamic entries
  }

  return entries;
}
