// Converts unDraw SVGs into theme-aware markup: the violet becomes the brand colour and greys become tokens
// (--illustration-* in src/app/globals.css). Download SVGs from https://undraw.co into a folder, add their
// file names to `names` below, then:
//
//   node scripts/convert-undraw.mjs <folder> src/components/illustrations/svgs.ts
import fs from "node:fs";
import path from "node:path";

const [, , srcDir, outFile] = process.argv;
const names = {
  contract_ynau: "contract",
  "empty-mailbox_ef0e": "emptyMailbox",
  searching_pqji: "searching",
  "search-results_reis": "searchResults",
  "well-done_kqud": "wellDone",
  "all-checked_d3u6": "allChecked",
  "files-missing_ntwe": "filesMissing",
  "reviewed-docs_tng3": "reviewedDocs",
  "the-right-time_n3ys": "waiting",
  team_mmq0: "team",
  "nobody-home_znfu": "nobodyHome",
  "handshake-deal_nwk6": "handshake",
};

function token(hex) {
  let h = hex.slice(1).toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (h === "6c63ff") return "var(--illustration-primary)";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const light = (max + min) / 2 / 255;
  const greyish = max - min < 40;
  if (!greyish) return null; // skin, hair, accents keep their colour
  if (light < 0.35) return "var(--illustration-ink)";
  if (light < 0.75) return "var(--illustration-mid)";
  if (light < 0.97) return "var(--illustration-surface)";
  return "var(--illustration-paper)";
}

const out = {};
for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith(".svg"))) {
  const key = names[path.basename(file, ".svg")];
  if (!key) continue;
  let svg = fs.readFileSync(path.join(srcDir, file), "utf8");
  if (!svg.includes("<svg")) throw new Error(`${file} isn't an SVG`);
  svg = svg
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Size comes from CSS: drop the root element's width and height (inner shapes keep theirs)
    .replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, ""))
    .replace(/\s(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g, (m, attr, hex) => {
      const t = token(hex);
      return t ? ` style="${attr}:${t}"` : m;
    })
    .replace(/\s+/g, " ")
    .trim();
  // Scripts or event handlers would never be in unDraw art; refuse rather than inline them
  if (/<script|\son[a-z]+=/i.test(svg)) throw new Error(`${file} contains script`);
  out[key] = svg.replace("<svg", '<svg aria-hidden="true" focusable="false"');
}

const keys = Object.keys(out).sort();
const body = keys.map((k) => `  ${k}: ${JSON.stringify(out[k])},`).join("\n");
fs.writeFileSync(
  outFile,
  `/*\n * unDraw illustrations (https://undraw.co, free to use without attribution), recoloured from theme tokens\n * (--illustration-* in globals.css). Generated; to add one, see scripts/convert-undraw.mjs.\n */\n\nexport const ILLUSTRATIONS = {\n${body}\n} as const;\n\nexport type IllustrationName = keyof typeof ILLUSTRATIONS;\n`,
);
console.log("wrote", keys.length, "illustrations:", keys.join(", "));
