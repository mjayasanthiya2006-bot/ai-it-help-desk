import { Router, type IRouter } from "express";
import {
  DiagnoseIssueBody,
  DiagnoseIssueResponse,
  GetHelpdeskOverviewResponse,
  RunDiagnosticToolBody,
  RunDiagnosticToolResponse,
  SearchKnowledgeQueryParams,
  SearchKnowledgeResponse,
} from "@workspace/api-zod";

type Article = {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  tags: string[];
};

const articles: Article[] = [
  {
    id: "kb-network-001",
    title: "Wi-Fi connected, but there is no internet",
    category: "Network",
    summary: "A quick sequence for separating a local Wi-Fi issue from DNS, VPN, or upstream connectivity.",
    content:
      "Confirm the device has an IP address, test a known public site, pause the VPN, and retry. If other devices are also offline, restart the access point and escalate to the network owner.",
    tags: ["wifi", "internet", "dns", "vpn", "network"],
  },
  {
    id: "kb-vpn-002",
    title: "VPN connects but internal tools do not load",
    category: "Access",
    summary: "Resolve split-tunnel and stale-session problems before resetting credentials.",
    content:
      "Disconnect and reconnect the VPN, verify the expected region or profile, then test an internal hostname. If the VPN shows connected but private DNS fails, refresh the VPN session and capture the client version for IT.",
    tags: ["vpn", "access", "internal", "dns", "login"],
  },
  {
    id: "kb-printer-003",
    title: "Printer is missing or stuck in the queue",
    category: "Devices",
    summary: "Clear a stuck print job and reconnect to the correct shared printer.",
    content:
      "Cancel the oldest queued job, confirm the printer is online, and remove and re-add the shared printer if the queue remains paused. Avoid repeatedly resending the same document.",
    tags: ["printer", "queue", "device", "print"],
  },
  {
    id: "kb-performance-004",
    title: "Laptop is unusually slow",
    category: "Performance",
    summary: "Check the common causes of a slow workstation without deleting user data.",
    content:
      "Save work, close heavy browser tabs, check available disk space, and restart the device if uptime is high. If slowness returns, note the top processes and whether it occurs on battery or power.",
    tags: ["slow", "performance", "disk", "laptop", "memory"],
  },
  {
    id: "kb-password-005",
    title: "Password reset or account lockout",
    category: "Access",
    summary: "Recover access safely while avoiding repeated failed sign-in attempts.",
    content:
      "Stop retrying the old password, use the approved reset flow, and complete MFA. If the reset succeeds but sign-in still fails, check for a saved old password in the device or browser.",
    tags: ["password", "login", "locked", "mfa", "account"],
  },
  {
    id: "kb-browser-006",
    title: "Web app shows a blank page or stale content",
    category: "Applications",
    summary: "Use a low-risk browser sequence before clearing broad site data.",
    content:
      "Open a private window, reload without cache, and disable extensions for the affected site. If the private window works, re-enable extensions one at a time and keep the original tab open for comparison.",
    tags: ["browser", "blank", "web", "cache", "extension"],
  },
];

const router: IRouter = Router();

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);

const searchArticles = (query = "", category?: string) => {
  const tokens = tokenize(query);
  return articles
    .filter((article) => !category || article.category.toLowerCase() === category.toLowerCase())
    .map((article) => {
      const haystack = `${article.title} ${article.summary} ${article.content} ${article.tags.join(" ")}`.toLowerCase();
      const matched = tokens.filter((token) => haystack.includes(token));
      const relevance = query ? Math.min(0.98, 0.48 + matched.length * 0.11) : 0.72;
      return {
        ...article,
        relevance: Number(relevance.toFixed(2)),
        matchCount: matched.length,
      };
    })
    .sort((a, b) => b.matchCount - a.matchCount || b.relevance - a.relevance)
    .slice(0, 4)
    .map(({ matchCount: _matchCount, ...article }) => article);
};

const toolFor = (kind: string | null) => {
  if (kind === "network") return "check_network";
  if (kind === "vpn") return "check_vpn";
  if (kind === "printer") return "check_printer";
  if (kind === "disk") return "check_disk";
  if (kind === "browser") return "check_browser";
  return "collect_context";
};

router.get("/overview", (_req, res) => {
  const data = GetHelpdeskOverviewResponse.parse({
    articles: articles.length,
    issueTypes: 6,
    avgResolution: "6 min",
    solvedThisWeek: 128,
    toolChecks: 342,
  });
  res.json(data);
});

router.get("/knowledge", (req, res) => {
  const params = SearchKnowledgeQueryParams.parse(req.query);
  res.json(SearchKnowledgeResponse.parse(searchArticles(params.q, params.category)));
});

router.post("/diagnose", (req, res) => {
  const input = DiagnoseIssueBody.parse(req.body);
  const normalized = input.issue.toLowerCase();
  const kind = normalized.includes("wifi") || normalized.includes("internet") || normalized.includes("network")
    ? "network"
    : normalized.includes("vpn") || normalized.includes("internal") || normalized.includes("access")
      ? "vpn"
      : normalized.includes("printer") || normalized.includes("print")
        ? "printer"
        : normalized.includes("slow") || normalized.includes("lag") || normalized.includes("disk")
          ? "disk"
          : normalized.includes("blank") || normalized.includes("browser") || normalized.includes("web")
            ? "browser"
            : null;

  const sources = searchArticles(input.issue);
  const plans: Record<string, { diagnosis: string; severity: string; confidence: number; steps: Array<{ id: string; title: string; detail: string; tool: string | null; status: string }>; reply: string }> = {
    network: {
      diagnosis: "The symptoms point to a local connectivity or name-resolution issue rather than an account problem.",
      severity: "medium",
      confidence: 0.9,
      steps: [
        { id: "network-1", title: "Check the connection path", detail: "Confirm the device has an IP address and can reach a known public site.", tool: "check_network", status: "ready" },
        { id: "network-2", title: "Pause VPN temporarily", detail: "Disconnect the VPN once and retry the same site to isolate split-tunnel or DNS behavior.", tool: "check_vpn", status: "ready" },
        { id: "network-3", title: "Reconnect to Wi-Fi", detail: "Forget and rejoin the network only after the first two checks; this avoids losing useful context.", tool: null, status: "manual" },
      ],
      reply: "I found a likely local network or DNS path issue. Start with the connection check, then pause the VPN once and retry. If other devices are also offline, escalate to the network owner instead of repeating local resets.",
    },
    vpn: {
      diagnosis: "The VPN session may be established while private DNS or the internal route is stale.",
      severity: "high",
      confidence: 0.87,
      steps: [
        { id: "vpn-1", title: "Check the VPN session", detail: "Verify the client is connected to the expected profile and region.", tool: "check_vpn", status: "ready" },
        { id: "vpn-2", title: "Refresh private DNS", detail: "Disconnect, wait ten seconds, and reconnect before testing an internal hostname.", tool: "check_network", status: "ready" },
        { id: "vpn-3", title: "Capture client details", detail: "If the issue persists, record the VPN client version and exact internal hostname for IT.", tool: null, status: "manual" },
      ],
      reply: "The VPN session is the most likely cause. Check the active profile, refresh the session, and test one internal hostname before resetting credentials.",
    },
    printer: {
      diagnosis: "This looks like a paused queue or a stale shared-printer connection.",
      severity: "low",
      confidence: 0.88,
      steps: [
        { id: "printer-1", title: "Inspect the print queue", detail: "Find the oldest job and cancel it instead of resending the document.", tool: "check_printer", status: "ready" },
        { id: "printer-2", title: "Confirm printer availability", detail: "Check that the printer is online and selected as the intended shared device.", tool: null, status: "manual" },
        { id: "printer-3", title: "Reconnect if needed", detail: "Remove and add the shared printer again only if the queue stays paused.", tool: null, status: "manual" },
      ],
      reply: "This is most consistent with a paused queue or stale shared-printer connection. Inspect the queue first, then reconnect only if the printer is online and still unavailable.",
    },
    disk: {
      diagnosis: "The performance issue is likely related to resource pressure or long device uptime.",
      severity: "medium",
      confidence: 0.81,
      steps: [
        { id: "disk-1", title: "Check disk pressure", detail: "Review available disk space without deleting user files.", tool: "check_disk", status: "ready" },
        { id: "disk-2", title: "Reduce active load", detail: "Close heavy tabs and applications, then compare performance for two minutes.", tool: null, status: "manual" },
        { id: "disk-3", title: "Restart when safe", detail: "Save work and restart if uptime is high; note whether the problem returns.", tool: null, status: "manual" },
      ],
      reply: "The most likely causes are resource pressure or long uptime. Check disk headroom first, reduce active load, then restart when it is safe to do so.",
    },
    browser: {
      diagnosis: "The issue is likely isolated to cached content or a browser extension.",
      severity: "low",
      confidence: 0.84,
      steps: [
        { id: "browser-1", title: "Compare a private window", detail: "Open the same page privately to separate account and browser-state problems.", tool: "check_browser", status: "ready" },
        { id: "browser-2", title: "Reload without cache", detail: "Refresh the page without cache before clearing broad site data.", tool: null, status: "manual" },
        { id: "browser-3", title: "Isolate extensions", detail: "Disable extensions for the affected site and re-enable them one at a time.", tool: null, status: "manual" },
      ],
      reply: "The issue is likely browser state rather than the application itself. Compare a private window first, then isolate extensions before clearing site data.",
    },
  };

  const fallback = {
    diagnosis: "There is not enough signal yet to identify one root cause, so start with low-risk context checks.",
    severity: "medium",
    confidence: 0.58,
    steps: [
      { id: "general-1", title: "Capture the exact symptom", detail: "Note the app, device, time, and exact error text before making changes.", tool: "collect_context", status: "ready" },
      { id: "general-2", title: "Retry once in a clean state", detail: "Reopen the affected app or page once, then compare the result.", tool: null, status: "manual" },
      { id: "general-3", title: "Escalate with evidence", detail: "Share the error text and what changed after the retry if the issue continues.", tool: null, status: "manual" },
    ],
    reply: "I need one more concrete symptom to narrow this down. Capture the exact error text and device first, then try one clean retry without repeating risky resets.",
  };
  const plan = plans[kind ?? ""] ?? fallback;
  const data = DiagnoseIssueResponse.parse({
    id: `diag-${Date.now()}`,
    issue: input.issue,
    diagnosis: plan.diagnosis,
    confidence: plan.confidence,
    severity: plan.severity,
    steps: plan.steps,
    sources: sources.length ? sources : searchArticles(),
    suggestedReply: plan.reply,
    createdAt: new Date().toISOString(),
  });
  res.json(data);
});

router.post("/tools/check", (req, res) => {
  const input = RunDiagnosticToolBody.parse(req.body);
  const tool = input.tool.toLowerCase();
  const target = input.target || "current device";
  const result = tool.includes("vpn")
    ? { status: "attention", summary: `VPN session checked for ${target}`, details: ["Client is reachable", "Profile is present", "Private DNS response needs a reconnect to confirm"] }
    : tool.includes("printer")
      ? { status: "passed", summary: `Printer queue checked for ${target}`, details: ["Printer is discoverable", "One queued job is waiting", "No destructive action was taken"] }
      : tool.includes("disk")
        ? { status: "passed", summary: `Disk headroom checked for ${target}`, details: ["System volume is readable", "No files were changed", "Review large applications if the slowdown returns"] }
        : tool.includes("browser")
          ? { status: "passed", summary: `Browser session checked for ${target}`, details: ["Secure page load is available", "A clean-session comparison is recommended", "No cookies or site data were changed"] }
          : { status: "passed", summary: `Network path checked for ${target}`, details: ["Local adapter is responding", "Gateway is reachable", "Public DNS probe is available"] };
  res.json(RunDiagnosticToolResponse.parse({ tool: input.tool, target, ...result, checkedAt: new Date().toISOString() }));
});

export default router;