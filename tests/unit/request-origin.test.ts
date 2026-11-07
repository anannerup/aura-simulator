import { describe, expect, it } from "vitest";
import { requestOrigin } from "@/server/request-origin";

describe("requestOrigin", () => {
  it("prefers the proxy's forwarded host and protocol (first hop)", () => {
    const headers = new Headers({
      host: "127.0.0.1:3000",
      "x-forwarded-host": "auras.example.org, inner.proxy",
      "x-forwarded-proto": "https,http",
    });
    expect(requestOrigin(headers)).toBe("https://auras.example.org");
  });

  it("falls back to the Host header over http", () => {
    expect(requestOrigin(new Headers({ host: "192.168.0.50:3000" }))).toBe("http://192.168.0.50:3000");
  });
});
