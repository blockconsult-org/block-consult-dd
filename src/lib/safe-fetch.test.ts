import { describe, expect, it } from "vitest";
import { isBlockedAddress } from "./safe-fetch";

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local, metadata and reserved addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fd12:3456:789a::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "not-an-ip",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "104.16.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });
});
