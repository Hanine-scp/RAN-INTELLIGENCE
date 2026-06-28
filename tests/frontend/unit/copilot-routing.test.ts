import { describe, expect, it } from "vitest";

import {
  shouldAutoWebSearch,
  shouldUseEnrichedInsight,
} from "@/lib/copilot-routing";

describe("copilot-routing", () => {
  it("enables auto web search for knowledge questions", () => {
    expect(shouldAutoWebSearch("Qu'est-ce qu'un RAN (radio access network) ?")).toBe(true);
  });

  it("skips auto web search for ops queries", () => {
    expect(shouldAutoWebSearch("Quels sites sont critiques cette semaine ?")).toBe(false);
  });

  it("uses enriched insight when web search is requested", () => {
    expect(shouldUseEnrichedInsight("hello", 0, true)).toBe(true);
  });
});
