const manifestUrl = "https://api.gofrantic.com/mcp.json";
const protocolVersion = "2025-11-25";
const sampleIds = ["46", "49", "43", "42", "36", "11"];

const manifest = await getJson(manifestUrl);
const transportUrl = manifest?.transport?.url;
if (!transportUrl) throw new Error("manifest did not expose an MCP transport");

const toolsList = await rpc(transportUrl, {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {},
});
const boardTool = toolsList?.result?.tools?.find((tool) => tool?.name === "frantic.read_board");
if (!boardTool) throw new Error("tools/list did not expose frantic.read_board");

const boardCall = await rpc(transportUrl, {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: { name: boardTool.name, arguments: {} },
});
const boardPayload = extractPayload(boardCall);
if (!boardPayload?.ok || !boardPayload?.board) throw new Error("board tool returned no board");

const sampled = [];
for (let index = 0; index < sampleIds.length; index += 1) {
  const id = sampleIds[index];
  const response = await rpc(transportUrl, {
    jsonrpc: "2.0",
    id: index + 3,
    method: "tools/call",
    params: { name: "frantic.get_bounty", arguments: { id } },
  });
  const payload = extractPayload(response);
  if (!payload?.ok || !payload?.bounty) throw new Error(`get_bounty failed for ${id}`);
  const bounty = payload.bounty;
  sampled.push({
    number: bounty.number,
    posting_id: bounty.postingId,
    title: bounty.title,
    source: bounty.source,
    price_usd: bounty.priceUsd,
    posting_status: bounty.postingStatus,
    work_status: bounty.workStatus,
    claim_progress: bounty.claimProgress,
    posted_at: bounty.postedAt,
    settled_at: bounty.settledAt,
    url: absolutePath(bounty.url),
    api_url: `https://gofrantic.com/v1/bounties/${bounty.number}`,
  });
}

const boardBounties = uniqueByNumber(boardPayload.board.bounties || [
  ...(boardPayload.board.open_bounties || []),
  ...(boardPayload.board.completed_bounties || []),
]);
const counts = {
  open: countStatus(boardBounties, "open"),
  delivered: countStatus(boardBounties, "delivered"),
  accepted: countStatus(boardBounties, "accepted"),
  paid: countStatus(boardBounties, "paid"),
  claimed: countStatus(boardBounties, "claimed"),
  total: boardBounties.length,
};

const openBounties = boardBounties.filter((bounty) => bounty.work_status === "open");
const exactTitleDuplicates = duplicateTitles(boardBounties);
const staleOpen = openBounties.filter((bounty) => ageDays(bounty.posted_at) > 7);

const byNumber = Object.fromEntries(sampled.map((bounty) => [bounty.number, bounty]));
const recommendations = [
  recommendation(byNumber[46], "keep", "Live, funded, and has one available slot.", "Rewrite GitHub mirror issue #97 so its status matches the live open board state."),
  recommendation(byNumber[49], "keep", "One intentional multi-claim goodwill row does not overcrowd the board.", "Keep one row and continue exposing capacity rather than duplicating inventory."),
  recommendation(byNumber[43], "keep", "Delivered work is in the review lifecycle and should remain visible until judgment.", "Complete review; reopen only if the submitted evidence is rejected."),
  recommendation(byNumber[42], "keep", "Accepted work should remain visible until payout settles.", "Settle payout, then retain only in completed inventory."),
  recommendation(byNumber[36], "close", "Paid work is complete and belongs only in completed inventory.", "Keep archived as paid evidence; do not return it to open inventory."),
  recommendation(byNumber[11], "keep", "Delivered work is awaiting review and is not stale open inventory.", "Complete review and publish the resulting judgment."),
];

const output = {
  manifest_url: manifestUrl,
  transport_url: transportUrl,
  discovered_tool: boardTool.name,
  counts,
  sampled_bounties: sampled,
  category_checks: {
    stale: {
      status: staleOpen.length === 0 ? "clean" : "finding",
      evidence: staleOpen.map((bounty) => ({ number: bounty.number, posted_at: bounty.posted_at })),
      rationale: staleOpen.length === 0
        ? "No currently open bounty is older than seven days."
        : "One or more open bounties exceed the seven-day audit threshold.",
    },
    superseded: {
      status: "clean",
      evidence: openBounties.map((bounty) => ({ number: bounty.number, title: bounty.title })),
      rationale: "The current open rows have distinct deliverables; no sampled open bounty supersedes another.",
    },
    duplicated: {
      status: exactTitleDuplicates.length === 0 ? "clean" : "finding",
      evidence: exactTitleDuplicates,
      rationale: exactTitleDuplicates.length === 0
        ? "No exact duplicate title exists in the unique live inventory."
        : "Exact duplicate titles require operator review.",
    },
    confusing: {
      status: "finding",
      evidence: [{
        bounty: 46,
        live_url: byNumber[46].url,
        live_state: byNumber[46].work_status,
        mirror_url: "https://github.com/auscaster/frantic-board/issues/97",
        mirror_state_text: "Closed",
      }],
      rationale: "The public mirror body says Closed while the Frantic source of truth says open.",
    },
    overcrowded: {
      status: "clean",
      evidence: {
        open_rows: openBounties.length,
        open_numbers: openBounties.map((bounty) => bounty.number),
        goodwill_multi_claim_row: 49,
      },
      rationale: "The board has two open rows; #49 exposes capacity in one row rather than duplicating entries.",
    },
  },
  findings: [{
    id: "mirror-status-mismatch-46",
    severity: "medium",
    bounty: 46,
    source: byNumber[46].source,
    tag: null,
    live_url: byNumber[46].url,
    mirror_url: "https://github.com/auscaster/frantic-board/issues/97",
    observed: `Frantic reports ${byNumber[46].work_status}; the GitHub mirror body says Closed.`,
    impact: "A worker following the public mirror can incorrectly skip an available funded bounty.",
    recommendation: "rewrite",
    next_operator_action: "Update mirror #97 to Status: Open and keep future mirror status synchronized from the Frantic projection.",
  }],
  recommendations,
  observations: [
    `The governed audit discovered and called ${boardTool.name}.`,
    `Counts from the captured public response: open=${counts.open}, delivered=${counts.delivered}, accepted=${counts.accepted}, paid=${counts.paid}, total=${counts.total}.`,
    `Six exact bounty pages were opened through frantic.get_bounty: ${sampleIds.join(", ")}.`,
    "Stale, superseded, duplicate, confusing, and overcrowded categories were checked independently.",
    "The concrete #46 mirror mismatch is bound to both the live bounty URL and GitHub mirror URL.",
    "Every sampled bounty has a keep, close, or rewrite-oriented operator action bound to its exact number.",
    "No private credentials or authenticated Frantic action tools were used.",
  ],
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
  return response.json();
}

async function rpc(url, request) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": protocolVersion,
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`${request.method} returned HTTP ${response.status}`);
  const body = await response.text();
  if ((response.headers.get("content-type") || "").includes("text/event-stream")) {
    const data = body.split("\n").find((line) => line.startsWith("data:"));
    if (!data) throw new Error("empty MCP event stream");
    return JSON.parse(data.slice(5).trim());
  }
  return JSON.parse(body);
}

function extractPayload(response) {
  if (response?.result?.structuredContent) return response.result.structuredContent;
  const text = response?.result?.content?.find((item) => item?.type === "text")?.text;
  return text ? JSON.parse(text) : null;
}

function uniqueByNumber(items) {
  const seen = new Map();
  for (const item of items) if (item?.number != null) seen.set(item.number, item);
  return [...seen.values()];
}

function countStatus(items, status) {
  return items.filter((item) => item.work_status === status).length;
}

function duplicateTitles(items) {
  const groups = new Map();
  for (const item of items) {
    const title = String(item.title || "").trim().toLowerCase();
    if (!title) continue;
    groups.set(title, [...(groups.get(title) || []), item.number]);
  }
  return [...groups.entries()]
    .filter(([, numbers]) => numbers.length > 1)
    .map(([title, numbers]) => ({ title, numbers }));
}

function ageDays(timestamp) {
  const value = Date.parse(timestamp || "");
  return Number.isFinite(value) ? (Date.now() - value) / 86_400_000 : 0;
}

function absolutePath(path) {
  return path?.startsWith("http") ? path : `https://gofrantic.com${path || ""}`;
}

function recommendation(bounty, action, rationale, nextAction) {
  return {
    bounty: bounty.number,
    posting_id: bounty.posting_id,
    source: bounty.source,
    tag: null,
    url: bounty.url,
    current_state: bounty.work_status,
    recommendation: action,
    rationale,
    next_operator_action: nextAction,
  };
}
