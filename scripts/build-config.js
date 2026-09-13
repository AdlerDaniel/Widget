const fs = require("node:fs");
const notes = JSON.parse(fs.readFileSync("changes.json", "utf8"));
if (
  !Array.isArray(notes) ||
  !notes.length ||
  notes.some((n) => typeof n !== "string")
)
  throw Error("changes.json должен содержать список изменений");
fs.writeFileSync(
  "release-config.json",
  JSON.stringify(
    {
      extends: null,
      ...require("../package.json").build,
      releaseInfo: { releaseNotes: notes.map((n) => "• " + n).join("\n") },
    },
    null,
    2,
  ),
);
