import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShareLink, decodeBase64, encodeBase64, fetchSubscription, inspectImport, parseProfile } from "../src/lib/parseShare";
import { defaultState, restoreBackup } from "../src/lib/storage";
import { browserStatus, nativeRequest, supportsNative, validAdvanced } from "../src/lib/native";

const id = "00000000-0000-4000-8000-000000000001";
const input = `vless://${id}@server.invalid:8443?type=ws&security=tls&host=cdn.invalid&path=%2Fproxy&sni=cdn.invalid#Personal`;

test("fresh installations contain no servers or subscriptions", () => {
  assert.deepEqual(defaultState().profiles, []);
  assert.deepEqual(defaultState().subs, []);
  assert.equal(defaultState().selectedId, null);
  assert.equal(browserStatus.state, "disconnected");
  assert.equal(browserStatus.uploaded, null);
});
test("URI import preserves credentials, transport and the original link", () => {
  const p = parseProfile(input);
  assert.equal(p.uuid, id);
  assert.equal(p.port, 8443);
  assert.equal(p.path, "/proxy");
  assert.equal(p.hostHeader, "cdn.invalid");
  assert.equal(p.sni, "cdn.invalid");
  assert.equal(p.raw, input);
});
test("Reality, XHTTP and unknown query parameters survive import", () => {
  const raw = `vless://${id}@[2001:db8::1]:443?type=xhttp&security=reality&sni=server.invalid&pbk=${"A".repeat(43)}&sid=0123&fp=chrome&flow=xtls-rprx-vision&mode=auto#Reality`;
  const p = parseProfile(raw);
  assert.equal(p.host, "2001:db8::1");
  assert.equal(p.publicKey, "A".repeat(43));
  assert.equal(p.shortId, "0123");
  assert.equal(p.params?.mode, "auto");
  assert.equal(p.raw, raw);
});
test("VMess manual input generates valid base64 JSON", () => {
  const raw = buildShareLink({ protocol: "vmess", name: "\u0633\u0631\u0648\u0631", host: "server.invalid", port: 443, uuid: id, transport: "grpc", security: "tls", sni: "tls.invalid", path: "service" });
  const p = parseProfile(raw);
  assert.equal(p.name, "\u0633\u0631\u0648\u0631");
  assert.equal(p.path, "service");
  assert.equal(JSON.parse(decodeBase64(raw.slice(8))).id, id);
});
test("SIP002 supports passwords with colons and IPv6", () => {
  const p = parseProfile(buildShareLink({ protocol: "ss", name: "SS", host: "2001:db8::1", port: 8388, method: "aes-256-gcm", password: "test:password@with-symbols" }));
  assert.equal(p.host, "2001:db8::1");
  assert.equal(p.password, "test:password@with-symbols");
  assert.equal(p.method, "aes-256-gcm");
});
test("invalid ports, UUIDs and Reality parameters are rejected", () => {
  assert.throws(() => buildShareLink({ protocol: "vless", name: "bad", host: "server.invalid", port: 0, uuid: id }));
  assert.throws(() => parseProfile("vless://not-a-uuid@server.invalid:443"));
  assert.throws(() => parseProfile(`vless://${id}@server.invalid:443?security=reality&pbk=broken`));
});
test("Base64 subscriptions report duplicates and malformed lines", () => {
  const result = inspectImport(encodeBase64(`${input}\n${input}\nbroken`));
  assert.equal(result.profiles.length, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.invalid.length, 1);
});
test("custom JSON is preserved and unsupported protocols are explicit", () => {
  const raw = JSON.stringify({ inbounds: [], outbounds: [{ protocol: "freedom", tag: "direct" }], routing: { rules: [] } });
  assert.equal(parseProfile(raw).raw, raw);
  assert.equal(parseProfile(raw).protocol, "custom");
  assert.equal(supportsNative(parseProfile("hy2://test-password@server.invalid:443#Test")), false);
  assert.throws(() => parseProfile('{"outbounds":[]}'));
});
test("backups are fully validated before replacement", () => {
  const p = parseProfile(input);
  const state = { ...defaultState(), profiles: [p], selectedId: p.id };
  assert.equal(restoreBackup(JSON.stringify(state)).profiles[0].raw, input);
  assert.throws(() => restoreBackup('{"profiles":"bad","subs":[]}'));
  assert.throws(() => restoreBackup(JSON.stringify({ ...state, profiles: [p, p] })));
  assert.equal(validAdvanced({ ...state.advanced, mtu: 0 }), false);
});
test("browsers reject native connection attempts", async () => {
  await assert.rejects(nativeRequest("connect", {}), /NATIVE_REQUIRED/);
});
test("subscription failures never use public CORS proxies", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (request) => { calls.push(String(request)); throw new TypeError("CORS"); };
  try {
    await assert.rejects(fetchSubscription("https://provider.invalid/private-token"), /FETCH_FAILED/);
    assert.deepEqual(calls, ["https://provider.invalid/private-token"]);
    await assert.rejects(fetchSubscription("http://provider.invalid/sub"), /INVALID_URL/);
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = original; }
});