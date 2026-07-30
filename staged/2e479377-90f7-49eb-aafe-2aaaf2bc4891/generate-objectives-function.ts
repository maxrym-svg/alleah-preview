// Edge Function: generate-objectives (v1 - Goals tab auto-generate mini-objectives)
// Goal title/category/description/difficulty in -> a short list of concrete,
// checkable mini-objective strings out, via forced tool call (shape enforced at
// the API level) - same forced-tool-choice pattern as capture-function.
// Goals themselves stay entirely client-side (localStorage, key alleah_goals_v1);
// this function only drafts checklist text, it never reads or writes any table.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-5";
const SYSTEM = [
  "You break a personal goal down into mini-objectives: small, concrete, independently checkable steps.",
  "Rules:",
  "- Produce 4-7 mini-objectives, ordered roughly in the sequence they'd be tackled.",
  "- Each one is a short actionable phrase (max ~10 words), not a restatement of the goal itself.",
  "- Ground them in the goal's title, category, difficulty and description (when given) - do not invent unrelated steps.",
  "- No numbering, no trailing punctuation, no filler like 'Step 1:'.",
].join("\n");

const TOOLS = [
  {
    name: "propose_objectives",
    description: "Propose the mini-objective checklist for this goal.",
    input_schema: {
      type: "object",
      properties: {
        objectives: {
          type: "array",
          minItems: 3,
          maxItems: 8,
          items: { type: "string" },
        },
      },
      required: ["objectives"],
    },
  },
];

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
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
    const title = String(body.title ?? "").trim();
    if (!title) return json({ error: "Missing goal title" }, 400);
    const category = String(body.category ?? "General").trim();
    const difficulty = String(body.difficulty ?? "medium").trim();
    const description = String(body.description ?? "").trim();

    const prompt = [
      "Goal: " + title,
      "Category: " + category,
      "Difficulty: " + difficulty,
      description ? "Description: " + description : "Description: (none given)",
    ].join("\n");

    const ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: SYSTEM,
        tools: TOOLS,
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!ar.ok) return json({ error: "Claude API: " + (await ar.text()) }, 502);
    const am = await ar.json();

    const toolUse = (am.content || []).find((c: { type: string }) => c.type === "tool_use");
    let objectives: string[] = [];
    if (toolUse && toolUse.name === "propose_objectives") {
      objectives = (toolUse.input.objectives ?? []) as string[];
    }
    objectives = objectives.map((o) => String(o).trim()).filter(Boolean).slice(0, 8);
    if (!objectives.length) return json({ error: "No usable objectives drafted" }, 502);
    return json({ objectives });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
