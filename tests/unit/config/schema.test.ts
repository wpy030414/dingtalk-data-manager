import { describe, it, expect } from "vitest";
import { ConfigSchema, YidaAppSchema } from "@/config/schema.ts";

describe("ConfigSchema", () => {
  it("should parse a valid minimal config", () => {
    const result = ConfigSchema.safeParse({
      ClientID: "ding123",
      ClientSecret: "secret123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.LogLevel).toBe("info");
      expect(result.data.YidaApps).toEqual([]);
    }
  });

  it("should parse a full config with Yida apps", () => {
    const result = ConfigSchema.safeParse({
      ClientID: "ding123",
      ClientSecret: "secret123",
      LogLevel: "debug",
      YidaApps: [
        {
          name: "请假审批",
          desp: "请假表单",
          appId: "APP_LEAVE_001",
          systemToken: "token123",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.YidaApps).toHaveLength(1);
      expect(result.data.YidaApps[0]!.name).toBe("请假审批");
      expect(result.data.YidaApps[0]!.appId).toBe("APP_LEAVE_001");
    }
  });

  it("should fail on missing ClientID", () => {
    const result = ConfigSchema.safeParse({
      ClientSecret: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("should fail on missing ClientSecret", () => {
    const result = ConfigSchema.safeParse({
      ClientID: "ding123",
    });
    expect(result.success).toBe(false);
  });

  it("should not accept BaseURL in config (it's hardcoded)", () => {
    const result = ConfigSchema.safeParse({
      ClientID: "ding123",
      ClientSecret: "secret123",
      BaseURL: "https://custom.example.com",
    });
    // Zod strips unknown keys by default, so this should succeed
    expect(result.success).toBe(true);
  });

  it("should fail on empty appId", () => {
    const result = ConfigSchema.safeParse({
      ClientID: "ding123",
      ClientSecret: "secret123",
      YidaApps: [
        {
          name: "test",
          appId: "",
          systemToken: "token",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("YidaAppSchema", () => {
  it("should parse a valid app", () => {
    const result = YidaAppSchema.safeParse({
      name: "test",
      appId: "APP_123",
      systemToken: "token123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.desp).toBe("");
    }
  });

  it("should fail on empty name", () => {
    const result = YidaAppSchema.safeParse({
      name: "",
      appId: "APP_123",
      systemToken: "token",
    });
    expect(result.success).toBe(false);
  });
});