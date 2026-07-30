// Edge Function: goal-steps
// Goals live client-side only (localStorage, see index.html Goals tab) - this function
// does NOT read or write any goals table. It is a stateless generator: given a goal's
// {title, description, difficulty}, it returns a short list of plausible mini-objective
// strings the client seeds a brand-new goal's checklist with. Auth-gated (must be signed
// in) purely to keep it from being an open, unauthenticated LLM proxy - nothing here is
// scoped to or stored against the caller's user id.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const STEPS_MODEL = "claude-haiku-4-5";
const VALID_DIFFICULTY = ["easy", "medium", "hard", "epic"];

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

const STEPS_TOOL = {
  name: "propose_steps",
  description: "Propose a short, ordered checklist of mini-objectives for the goal.",
  input_schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 6,
        description: "3-6 short, concrete, actionable checklist items, ordered roughly by when you'd do them. Plain strings, no numbering.",
      },
    },
    required: ["steps"],
  },
};

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

    let body: { title?: unknown; description?: unknown; difficulty?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    if (!title) return json({ error: "expected { title, description?, difficulty? }" }, 400);
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const difficulty = VALID_DIFFICULTY.includes(String(body.difficulty)) ? String(body.difficulty) : "medium";

    const am = await anthropic({
      model: STEPS_MODEL,
      max_tokens: 500,
      system: [
        "You break a personal goal into a short checklist of mini-objectives (concrete sub-steps),",
        "not a motivational essay. Each step is a single short actionable line (imagine it as a",
        "checkbox item), plausible as a real first pass at the goal. Harder/bigger goals ('hard',",
        "'epic') can use more steps (up to 6); easier ones should stay closer to 3-4.",
      ].join("\n"),
      tools: [STEPS_TOOL],
      tool_choice: { type: "tool", name: "propose_steps" },
      messages: [{
        role: "user",
        content: "Goal: " + title +
          (description ? "\nDescription: " + description : "") +
          "\nDifficulty: " + difficulty,
      }],
    });
    const out = toolUse(am)?.input as { steps?: unknown } | undefined;
    const steps = Array.isArray(out?.steps)
      ? (out!.steps as unknown[]).filter((s) => typeof s === "string" && s.trim()).slice(0, 6)
      : [];
    return json({ steps });
  } catch (e) {
    console.log("goal_steps_error", String(e).slice(0, 200));
    return json({ error: "server error" }, 500);
  }
});
