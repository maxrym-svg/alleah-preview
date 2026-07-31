// Edge Function: generate-objectives (v1.0 - Goals tab "auto-generate mini-objectives")
// Given one goal's title/category/difficulty/description, returns a short list of
// concrete mini-objective strings. Client merges them into that goal's `objectives`
// array (client-side, localStorage-persisted) - this function is stateless and never
// touches the database itself; it only produces text.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const OBJECTIVES_MODEL = "claude-haiku-4-5";

const SYSTEM = [
  "You break a personal goal down into a short checklist of concrete mini-objectives.",
  "Rules:",
  "- 4 to 6 objectives. Each is a single, concrete, checkable action - something Max can literally tick off.",
  "- Order them roughly in the sequence he'd actually do them (setup/research first, wrap-up last).",
  "- Use the goal's own title/category/difficulty/description to make them specific to THIS goal, not generic filler.",
  "- No numbering, no markdown, no trailing punctuation beyond what a short phrase needs.",
].join("\n");

const OBJECTIVES_TOOL = {
  name: "objectives",
  description: "Return the generated mini-objectives for this goal.",
  input_schema: {
    type: "object",
    properties: {
      objectives: {
        type: "array",
        items: { type: "string" },
        description: "4-6 short, concrete, checkable mini-objective strings.",
      },
    },
    required: ["objectives"],
  },
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

async function anthropic(body: Record<string, unknown>) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Claude API: " + (await r.text()));
  return await r.json();
}

function toolUse(am: { content?: { type: string }[] }) {
  return (am.content || []).find((c: { type: string }) => c.type === "tool_use") as
    | { name: string; input: Record<string, unknown> }
    | undefined;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "POST only" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData || !userData.user) return json({ error: "Not signed in" }, 401);

    const body = await req.json();
    const goal = body.goal ?? {};
    const title = String(goal.title ?? "").slice(0, 200);
    if (!title) return json({ error: "goal.title is required" }, 400);
    const category = String(goal.category ?? "General").slice(0, 80);
    const difficulty = String(goal.difficulty ?? "medium").slice(0, 20);
    const description = String(goal.description ?? "").slice(0, 800);
    const existing: string[] = Array.isArray(goal.existing_objectives) ? goal.existing_objectives.slice(0, 20) : [];

    const userContent = [
      "Goal title: " + title,
      "Category: " + category,
      "Difficulty: " + difficulty,
      description ? "Description: " + description : "Description: (none given)",
      existing.length ? "Objectives already on the checklist (do not repeat these):\n- " + existing.join("\n- ") : "No existing objectives yet.",
    ].join("\n");

    const am = await anthropic({
      model: OBJECTIVES_MODEL,
      max_tokens: 500,
      system: SYSTEM,
      tools: [OBJECTIVES_TOOL],
      tool_choice: { type: "tool", name: "objectives" },
      messages: [{ role: "user", content: userContent }],
    });

    const out = toolUse(am)?.input as { objectives?: string[] } | undefined;
    const objectives = (out?.objectives ?? [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!objectives.length) return json({ error: "no objectives generated" }, 500);

    return json({ objectives });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
