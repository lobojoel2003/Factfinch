import { describe, expect, it } from "vitest";
import { formatDollar, formatValue, renderTemplate, templateRefs } from "../src/index.js";

describe("formatValue", () => {
  it("formats dollars with and without cents", () => {
    expect(formatDollar(1234)).toBe("$1,234");
    expect(formatDollar(12.5)).toBe("$12.50");
    expect(formatValue(5, undefined, "dollar")).toBe("$5");
  });
  it("formats numbers, percents and booleans", () => {
    expect(formatValue(0.153, undefined, "percent")).toBe("15.3%");
    expect(formatValue(12000)).toBe("12,000");
    expect(formatValue(true)).toBe("Yes");
    expect(formatValue(false, undefined, "yesno")).toBe("no");
  });
  it("formats enums, strings, lists and missing values", () => {
    const def = { type: "enum" as const, options: [{ value: "a", label: "Apple Pie" }] };
    expect(formatValue("a", def)).toBe("Apple Pie");
    expect(formatValue("a", def, "lower")).toBe("apple pie");
    expect(formatValue("zz", def)).toBe("zz");
    expect(formatValue("Hello", undefined, "lower")).toBe("hello");
    expect(formatValue(["x"])).toBe("1 item");
    expect(formatValue(["x", "y"])).toBe("2 items");
    expect(formatValue(["x", "y"], undefined, "raw")).toBe("x, y");
    expect(formatValue(undefined)).toBe("(not answered yet)");
  });
});

describe("templates", () => {
  it("finds and fills references", () => {
    expect(templateRefs("{{/a}} and {{ ./b | dollar }} and {{const:c}}")).toEqual([
      "/a",
      "./b",
      "const:c",
    ]);
    expect(renderTemplate("x={{/a|dollar}}", (ref, fmt) => `${ref}:${fmt}`)).toBe("x=/a:dollar");
  });
});
