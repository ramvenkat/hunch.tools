const { loadPrompt } = await import("../dist/agent/prompts.js");

const prompt = await loadPrompt("main", {
  problem: "Dropoff",
  persona: "PM",
  journey: "Onboarding",
  decisions: "Use a concierge flow.",
  fileTree: "src/App.tsx",
});

if (!prompt.includes("Problem: Dropoff")) {
  throw new Error("Built prompt did not render the problem value.");
}

if (prompt.includes("{{")) {
  throw new Error("Built prompt still contains template tokens.");
}
