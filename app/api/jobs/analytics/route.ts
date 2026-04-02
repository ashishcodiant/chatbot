import { computeCustomerMetrics } from "@/lib/jobs/analytics";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  const providedBearer = authorization?.replace(/^Bearer\s+/i, "");
  const providedHeader = request.headers.get("x-cron-secret");

  return providedBearer === cronSecret || providedHeader === cronSecret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await computeCustomerMetrics();

  return Response.json({
    ok: true,
    ...result,
    durationMs: Date.now() - startedAt,
  });
}
