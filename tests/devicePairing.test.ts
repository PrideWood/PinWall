import test from "node:test";
import assert from "node:assert/strict";
import {
  isStandalone,
  pairingTokenFromLink,
} from "../src/lib/devicePairing.js";

const origin = "https://pw.example.test";
const token = "a".repeat(64);

test("standalone detection supports display-mode and iOS without treating tabs as apps", () => {
  assert.equal(
    isStandalone({ matchMedia: () => ({ matches: true }), navigator: {} }),
    true,
  );
  assert.equal(
    isStandalone({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true },
    }),
    true,
  );
  assert.equal(
    isStandalone({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: false },
    }),
    false,
  );
});

test("pairing links accept only one well-formed token from this app's origin", () => {
  assert.equal(
    pairingTokenFromLink(` ${origin}/phone#pair=${token}\n`, origin),
    token,
  );
  for (const link of [
    token,
    `/phone#pair=${token}`,
    `https://other.example.test/phone#pair=${token}`,
    `http://pw.example.test/phone#pair=${token}`,
    `${origin}/other#pair=${token}`,
    `${origin}/phone#request=${token}`,
    `${origin}/phone#pair=short`,
    `${origin}/phone#pair=${token}&pair=${token}`,
    `${origin}/phone#pair=${token}&request=${token}`,
    `${origin}/phone?pair=${token}`,
    `https://user:password@pw.example.test/phone#pair=${token}`,
    "javascript:alert(1)",
  ]) {
    assert.throws(
      () => pairingTokenFromLink(link, origin),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(
          !error.message.includes(token),
          "Errors must not echo pairing secrets",
        );
        return true;
      },
    );
  }
});
