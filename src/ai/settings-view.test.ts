import { describe, expect, it } from "vitest";
import { keyShapeError } from "./settings-view";

describe("keyShapeError", () => {
  it("accepts keys in the right field", () => {
    expect(keyShapeError("anthropic", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBeNull();
    expect(keyShapeError("openai", "sk-proj-abcdefghijklmnopqrstuvwxyz")).toBeNull();
  });

  it("rejects a key pasted into the other provider's field, so it is never sent to the wrong company", () => {
    expect(keyShapeError("openai", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toMatch(/Claude API key/);
    expect(keyShapeError("anthropic", "sk-proj-abcdefghijklmnopqrstuvwxyz")).toMatch(/sk-ant-/);
  });
});
