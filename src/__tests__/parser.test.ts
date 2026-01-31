import { parseMetadata } from "../lib/parser";
import { describe, it } from "node:test";
import assert from "node:assert";

describe("Metadata Parser", () => {
  it("should parse basic metadata", () => {
    const code = `
// ==UserScript==
// @name Test Script
// @version 1.0.0
// ==/UserScript==
    `;
    const metadata = parseMetadata(code);
    assert.strictEqual(metadata.name, "Test Script");
    assert.strictEqual(metadata.version, "1.0.0");
  });

  it("should parse multiple matches", () => {
    const code = `
// ==UserScript==
// @name Test
// @match *://google.com/*
// @match *://example.com/*
// ==/UserScript==
    `;
    const metadata = parseMetadata(code);
    assert.ok(metadata.matches.includes("*://google.com/*"));
    assert.ok(metadata.matches.includes("*://example.com/*"));
  });

  it("should handle localized names", () => {
     const code = `
// ==UserScript==
// @name:en English Name
// @name:zh Chinese Name
// ==/UserScript==
     `;
     const metadata = parseMetadata(code);
     assert.ok(metadata.name);
  });

  it("should parse resource directives", () => {
    const code = `
// ==UserScript==
// @name Resource Test
// @resource icon https://example.com/icon.png
// ==/UserScript==
    `;
    const metadata = parseMetadata(code);
    assert.strictEqual(metadata.resources.length, 1);
    assert.deepStrictEqual(metadata.resources[0], {
        name: "icon",
        url: "https://example.com/icon.png"
    });
  });

  it("should throw error if block is missing", () => {
      const code = "console.log('hello')";
      assert.throws(() => parseMetadata(code));
  });
});
