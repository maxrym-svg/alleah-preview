// NOTE (domain-scoped research handling): this file is intentionally NOT modified
// by this change. The feature - URL detection, the one-time scoping prompt, and
// generating the stricter research-task instruction skeleton - is implemented
// entirely client-side in staged/index.html (see: detectUrl, getDomain,
// guessSubdomains, buildDomainScopedInstruction, domainScopeDirectiveText,
// DomainScopePrompt, and the Chat component's send/runSend changes).
//
// Once Max resolves the scoping prompt, the client appends a plain-text block
// starting "DOMAIN SCOPE DIRECTIVE" to the copy of his message that gets POSTed
// to this function's /functions/v1/ask endpoint (the chat bubble he sees stays
// clean - only the payload sent here carries the directive). No new endpoint,
// tool, or schema change was needed to support that.
//
// The only behavioral hook this function needs is in ANSWER_SYSTEM (the system
// prompt used for the main chat completion): it should tell the model to treat
// a "DOMAIN SCOPE DIRECTIVE" block in Max's message as a REQUIRED instruction
// skeleton - to be used verbatim, only filling in the deliverable-specific
// detail Max also gave - when it composes the "Here's what I'll queue: ..."
// research task instruction, rather than widening the scope back out to a
// free-text/company-name search. Add one bullet along those lines to the
// existing "Rules for queuing" section of ANSWER_SYSTEM, right after the
// REMOVAL-requests bullet, when this lands - the rest of ask-function.ts
// (ambient pipeline, connection engine, HTTP handler, etc.) is unaffected and
// is deliberately left out of this staged listing rather than reproduced
// here at risk of drifting from the deployed source.
