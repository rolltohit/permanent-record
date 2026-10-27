import { describe, expect, it } from "vitest";
import {
  classifySendError,
  classifyVerifyError,
  cleanCode,
  inviteCodeFrom,
  inviteMessage,
  isPlausibleCode,
  joinTarget,
  parseJoinTarget,
  safeNext,
} from "./auth-flow";

describe("safeNext", () => {
  it("allows same-site paths only", () => {
    expect(safeNext("/r/123?x=1")).toBe("/r/123?x=1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(["/a"])).toBe("/");
  });
});

describe("inviteCodeFrom", () => {
  it("finds the code in whatever gets pasted", () => {
    expect(inviteCodeFrom("https://permanent-record.vercel.app/invite/abc123def456")).toBe("abc123def456");
    expect(inviteCodeFrom("  permanent-record.vercel.app/invite/abc123def456/  ")).toBe("abc123def456");
    expect(inviteCodeFrom("Join me! https://x.app/invite/abc123def456 see you")).toBe("abc123def456");
    expect(inviteCodeFrom("abc123def456")).toBe("abc123def456");
    expect(inviteCodeFrom("hello there")).toBeNull();
    expect(inviteCodeFrom("https://x.app/login")).toBeNull();
  });
});

describe("join targets round-trip through the email link", () => {
  it("carries the invite and the typed name", () => {
    const target = joinTarget({ invite: "abc123def456", name: " Sam Lee ", next: "/ignored" });
    expect(target).toBe("/invite/abc123def456?name=Sam+Lee");
    expect(parseJoinTarget(target)).toEqual({ invite: "abc123def456", name: "Sam Lee", next: target });
  });
  it("falls back to next without an invite, and rejects unsafe values", () => {
    expect(joinTarget({ next: "/r/1" })).toBe("/r/1");
    expect(joinTarget({ invite: "../../x", next: "//evil" })).toBe("/");
    expect(parseJoinTarget("/r/1")).toEqual({ invite: null, name: null, next: "/r/1" });
    expect(parseJoinTarget("https://evil.com/invite/abc123def456")).toEqual({ invite: null, name: null, next: "/" });
    expect(parseJoinTarget(null).next).toBe("/");
  });
  it("caps the name at 40 characters", () => {
    expect(parseJoinTarget(`/invite/abc123def456?name=${"x".repeat(60)}`).name).toHaveLength(40);
  });
});

describe("codes", () => {
  it("accepts codes typed or pasted with spaces and dashes", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("1234-5678")).toBe("12345678");
    expect(isPlausibleCode("123456")).toBe(true);
    expect(isPlausibleCode("12345678")).toBe(true);
    expect(isPlausibleCode("12345")).toBe(false);
    expect(isPlausibleCode("abcdef")).toBe(false);
  });
});

describe("error classification", () => {
  it("classifies sign-in email errors", () => {
    expect(classifySendError({ code: "otp_disabled", message: "Signups not allowed for otp" })).toBe("not_invited");
    expect(classifySendError({ message: "Signups not allowed for otp" })).toBe("not_invited");
    expect(
      classifySendError({ code: "over_request_rate_limit", status: 429, message: "For security purposes, you can only request this after 42 seconds." }),
    ).toBe("recently_sent");
    expect(classifySendError({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" })).toBe("email_limit");
    expect(classifySendError({ status: 429, message: "Too many requests" })).toBe("email_limit");
    expect(classifySendError({ code: "email_address_invalid" })).toBe("bad_email");
    expect(classifySendError({ status: 500, message: "boom" })).toBe("unknown");
  });
  it("classifies code errors", () => {
    expect(classifyVerifyError({ code: "otp_expired", message: "Token has expired or is invalid" })).toBe("wrong_or_expired");
    expect(classifyVerifyError({ status: 429, code: "over_request_rate_limit", message: "rate limit" })).toBe("too_many");
    expect(classifyVerifyError({ status: 500, message: "boom" })).toBe("unknown");
  });
});

describe("inviteMessage", () => {
  it("greets by name when there is one", () => {
    expect(inviteMessage("https://x/invite/a", "Sam")).toMatch(/^Hey Sam! .*https:\/\/x\/invite\/a$/);
    expect(inviteMessage("https://x/invite/a")).toMatch(/^Join me on Rec Room/);
  });
});
