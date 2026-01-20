/**
 * Stats API Endpoint
 * Returns current usage statistics (protected by API key)
 */

import { getDailyUsageStats } from "../../../lib/gemini.js";

export async function GET(request) {
  // Simple API key protection
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.STATS_API_KEY;

  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = getDailyUsageStats();

  return Response.json({
    daily: {
      calls: stats.count,
      threshold: stats.threshold,
      date: stats.date,
      alertSent: stats.alertSent,
      percentOfThreshold: Math.round((stats.count / stats.threshold) * 100),
    },
    timestamp: new Date().toISOString(),
  });
}
