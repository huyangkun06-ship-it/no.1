// Buildless static-site validation and optional Pages artifact assembly. No dependencies.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../.."),
  site = path.join(root, "water838");
const html = fs.readFileSync(path.join(site, "index.html"), "utf8");
const raw = html
  .split("const FULL_SEED=")[1]
  ?.split(";const BUNDLE_VERSION=")[0];
assert(raw, "Original question bundle must be present");
assert.equal(
  createHash("sha256").update(raw).digest("hex"),
  "5392ed882c1744290f51b9f23c7228a2ba9856bb7d556a06c6a7b90125efde42",
  "Original 211 records changed",
);
const seed = JSON.parse(raw);
assert.equal(seed.length, 211);
assert.equal(new Set(seed.map((x) => x.id)).size, 211);
assert(seed.every((x) => x.verified === false && x.needsReview === true));
assert.equal(new Set(seed.map((x) => x.chapter)).size, 12);
assert(html.includes("<title>838 · 背诵系统</title>"));
assert(!html.replace(raw, "").includes("川大"), "Brand copy must use 838");
for (const view of ["home", "study", "bank", "review", "tools"])
  assert(html.includes(`id="${view}"`));
const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
  .map((m) => m[1])
  .filter((x) => !/^https?:/.test(x));
for (const asset of assets) {
  assert(!asset.startsWith("/"), `Relative asset required: ${asset}`);
  assert(fs.existsSync(path.resolve(site, asset.split("?")[0])), `Missing asset: ${asset}`);
}
const manifest = JSON.parse(
  fs.readFileSync(path.join(site, "manifest.webmanifest"), "utf8"),
);
assert.equal(manifest.name, "838 · 背诵系统");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
for (const icon of manifest.icons)
  assert(fs.existsSync(path.resolve(site, icon.src)));
for (const file of ["app.js", "sw.js"])
  execFileSync(process.execPath, ["--check", path.join(site, file)], {
    stdio: "inherit",
  });
execFileSync(process.execPath, [path.join(__dirname, "water838-environment-validate.cjs")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(__dirname, "water838-water-images-validate.cjs")], { stdio: "inherit" });
const outArg = process.argv.indexOf("--out");
if (outArg !== -1) {
  assert(process.argv[outArg + 1], "Missing output directory");
  const out = path.resolve(process.argv[outArg + 1]);
  assert(out !== root && out !== site, "Use a separate build directory");
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(site, path.join(out, "water838"), { recursive: true });
  for (const file of [
    "index.html",
    "manifest.webmanifest",
    "icon-192.png",
    "icon-512.png",
  ])
    fs.copyFileSync(path.join(root, file), path.join(out, file));
  console.log(`Built static Pages artifact: ${out}`);
}
console.log(
  "PASS build: original bundle SHA-256, 211 unique records, 12 chapters, OCR flags, branding, five modules, relative assets, manifest, JS syntax; no runtime dependencies",
);
