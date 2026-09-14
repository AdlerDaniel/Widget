const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process");
const p = require("../package.json"),
  version = p.version,
  repo = p.build.publish[0].owner + "/" + p.build.publish[0].repo;
function command(exe, args, capture = false) {
  const r = spawnSync(exe, args, {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true,
    timeout: 300000,
  });
  if (r.status !== 0)
    throw Error(exe + " failed" + (capture ? ": " + r.stderr : ""));
  return r.stdout?.trim();
}
if (command("git", ["status", "--porcelain"], true))
  throw Error("Commit changes before publishing");
const exe = p.build.artifactName
    .replace("${version}", version)
    .replace("${ext}", "exe"),
  asset = path.join("dist", exe),
  manifest = fs.readFileSync("dist/latest.yml", "utf8");
if (
  !manifest.includes("version: " + version) ||
  !manifest.includes(
    crypto.createHash("sha512").update(fs.readFileSync(asset)).digest("base64"),
  )
)
  throw Error("Build and manifest do not match");
const tag = "v" + version,
  head = command("git", ["rev-parse", "HEAD"], true),
  empty = "dist/release-body.txt";
fs.writeFileSync(empty, "");
const existing = spawnSync(
  "gh",
  ["release", "view", tag, "--repo", repo, "--json", "isDraft"],
  { encoding: "utf8", windowsHide: true },
);
if (existing.status === 0) {
  if (!JSON.parse(existing.stdout).isDraft)
    throw Error("Published versions are immutable; bump the version");
} else
  command("gh", [
    "release",
    "create",
    tag,
    "--repo",
    repo,
    "--target",
    head,
    "--title",
    version,
    "--notes-file",
    empty,
    "--draft",
  ]);
command("gh", [
  "release",
  "upload",
  tag,
  asset,
  asset + ".blockmap",
  "dist/latest.yml",
  "--repo",
  repo,
  "--clobber",
]);
// A successful CLI exit is insufficient if an upload was interrupted externally.
const uploaded = JSON.parse(
  command(
    "gh",
    ["release", "view", tag, "--repo", repo, "--json", "assets"],
    true,
  ),
).assets;
for (const file of [asset, asset + ".blockmap", "dist/latest.yml"]) {
  const remote = uploaded.find((a) => a.name === path.basename(file));
  const data = fs.readFileSync(file);
  const digest =
    "sha256:" + crypto.createHash("sha256").update(data).digest("hex");
  if (
    !remote ||
    remote.state !== "uploaded" ||
    remote.size !== data.length ||
    remote.digest !== digest
  )
    throw Error(
      "Release asset is missing or incomplete: " + path.basename(file),
    );
}
command("gh", [
  "release",
  "edit",
  tag,
  "--repo",
  repo,
  "--draft=false",
  "--latest",
]);
console.log(
  "Published " +
    version +
    " at https://github.com/" +
    repo +
    "/releases/tag/" +
    tag,
);
