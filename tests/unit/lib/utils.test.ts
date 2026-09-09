import { describe, it, expect } from "vitest";
import { toCamelCase, camelCaseKeys, toDateString, buildQueryString } from "@/lib/utils.ts";

describe("toCamelCase", () => {
  it("should convert snake_case to camelCase", () => {
    expect(toCamelCase("hello_world")).toBe("helloWorld");
    expect(toCamelCase("user_first_name")).toBe("userFirstName");
  });

  it("should handle already camelCase", () => {
    expect(toCamelCase("helloWorld")).toBe("helloWorld");
  });

  it("should handle empty string", () => {
    expect(toCamelCase("")).toBe("");
  });
});

describe("camelCaseKeys", () => {
  it("should convert object keys", () => {
    const input = { user_name: "zhangsan", first_name: "san" };
    const result = camelCaseKeys<{ userName: string; firstName: string }>(input);
    expect(result).toEqual({ userName: "zhangsan", firstName: "san" });
  });

  it("should handle nested objects", () => {
    const input = { user_info: { full_name: "test" } };
    const result = camelCaseKeys<{ userInfo: { fullName: string } }>(input);
    expect(result).toEqual({ userInfo: { fullName: "test" } });
  });

  it("should handle arrays", () => {
    const input = [{ user_id: "1" }, { user_id: "2" }];
    const result = camelCaseKeys<{ userId: string }[]>(input);
    expect(result).toEqual([{ userId: "1" }, { userId: "2" }]);
  });
});

describe("toDateString", () => {
  it("should format date to YYYY-MM-DD", () => {
    const d = new Date("2024-01-15T09:00:00Z");
    expect(toDateString(d)).toBe("2024-01-15");
  });
});

describe("buildQueryString", () => {
  it("should build query string from params", () => {
    expect(buildQueryString({ a: "1", b: 2 })).toBe("?a=1&b=2");
  });

  it("should filter out undefined and null", () => {
    expect(buildQueryString({ a: "1", b: undefined, c: null })).toBe("?a=1");
  });

  it("should return empty string for empty params", () => {
    expect(buildQueryString({})).toBe("");
  });
});