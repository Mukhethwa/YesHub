// Writes the marketing video scene recipes (src/flute/scenes/*.scene.json). Run from the repo root:
//   node scripts/flute-choreography.mjs
import fs from "node:fs";

const SPEED = 0.65;
const dir = "src/flute/scenes";
const cam = { kind: "camera" };
const focus = { kind: "focus" };
const surf = (id) => ({ kind: "surface", id });

/** A track through [timeMs, value] points; every segment eases in and out. */
const kf = (target, property, points) => ({
  target,
  property,
  keyframes: points.map(([timeMs, value]) => ({ timeMs: Math.round(timeMs), value, easing: "cinematic" })),
});
/** Holds `from` until `start`, then settles to `to` by `end`. */
const settle = (id, property, from, to, start, end) =>
  kf(
    surf(id),
    property,
    start > 0
      ? [
          [0, from],
          [start, from],
          [end, to],
        ]
      : [
          [0, from],
          [end, to],
        ],
  );
/** Fades a leaf in between `start` and `end`. */
const fadeIn = (id, start, end) => settle(id, "opacity", 0, 1, start, end);

const node = (id, parentId) => ({ id, ...(parentId ? { parentId } : {}) });

function write(id, title, description, { durationMs, camera, focus: f, nodes, tracks }) {
  const recipe = {
    version: 1,
    id,
    title,
    description,
    definition: {
      scene: { version: 3, camera: { rotateZ: 0, ...camera }, focus: f, nodes },
      motion: { durationMs, speed: SPEED, tracks },
      width: 1920,
      height: 1080,
    },
  };
  fs.writeFileSync(`${dir}/${id}.scene.json`, JSON.stringify(recipe, null, 2) + "\n");
}

/* 1. Hero: the copy assembles from depth, the shortlist swings in, then two applicants lift out. */
{
  const copy = ["hero-badge", "hero-title", "hero-body", "hero-actions", "hero-figures"];
  const rows = ["shortlist-head", "applicant-0", "applicant-1", "applicant-2", "applicant-3", "shortlist-foot"];
  const tracks = [
    kf(cam, "x", [
      [0, -460],
      [5200, 300],
    ]),
    kf(cam, "y", [
      [0, 110],
      [5200, -60],
    ]),
    kf(cam, "z", [
      [0, -140],
      [2600, -560],
      [5200, -470],
    ]),
    kf(cam, "rotateY", [
      [0, -12],
      [5200, -30],
    ]),
    kf(cam, "rotateX", [
      [0, 4],
      [5200, 12],
    ]),
    kf(focus, "distance", [
      [0, 1480],
      [2600, 1060],
      [3000, 1060],
      [3800, 790],
      [5200, 830],
    ]),
    ...copy.flatMap((id, i) => [
      settle(id, "z", -520, 0, 150 + i * 200, 1300 + i * 200),
      settle(id, "y", 70, 0, 150 + i * 200, 1300 + i * 200),
      fadeIn(id, 150 + i * 200, 800 + i * 200),
    ]),
    settle("shortlist", "x", 760, 0, 0, 2300),
    settle("shortlist", "z", -760, 0, 0, 2300),
    kf(surf("shortlist"), "rotateY", [
      [0, -42],
      [2300, 0],
      [3600, 0],
      [4600, 6],
    ]),
    ...rows
      .filter((id) => id !== "applicant-0" && id !== "applicant-3")
      .flatMap((id) => {
        const i = rows.indexOf(id);
        return [settle(id, "z", 180, 0, 1500 + i * 160, 2400 + i * 160), fadeIn(id, 1500 + i * 160, 2000 + i * 160)];
      }),
    // The top applicant settles, then lifts out of the shortlist
    kf(surf("applicant-0"), "z", [
      [0, 180],
      [1660, 180],
      [2560, 0],
      [3000, 0],
      [3800, 290],
    ]),
    kf(surf("applicant-0"), "scale", [
      [0, 1],
      [3000, 1],
      [3800, 1.06],
    ]),
    kf(surf("applicant-0"), "x", [
      [0, 0],
      [3000, 0],
      [3800, -30],
    ]),
    fadeIn("applicant-0", 1660, 2160),
    // The ineligible one follows, pulled out to the side
    kf(surf("applicant-3"), "z", [
      [0, 180],
      [2140, 180],
      [3040, 0],
      [3900, 0],
      [4800, 230],
    ]),
    kf(surf("applicant-3"), "x", [
      [0, 0],
      [3900, 0],
      [4800, -70],
    ]),
    kf(surf("applicant-3"), "rotateZ", [
      [0, 0],
      [3900, 0],
      [4800, -2],
    ]),
    fadeIn("applicant-3", 2140, 2640),
  ];
  write(
    "hero",
    "Hero",
    "The headline assembles from depth, the ranked shortlist swings in, and two applicants lift out of it.",
    {
      durationMs: 5200,
      camera: { x: -460, y: 110, z: -140, perspective: 1600, rotateX: 4, rotateY: -12 },
      focus: { distance: 1480, fStop: 4, focalLength: 100, maxBlur: 6 },
      nodes: [
        node("hero"),
        ...copy.map((id) => node(id, "hero")),
        node("shortlist", "hero"),
        ...rows.map((id) => node(id, "shortlist")),
      ],
      tracks,
    },
  );
}

/* 2 and 3. The two audiences: copy slides in, the preview rises or swings in, one detail lifts out. */
function audience(id, { side, previewGroup, rows, highlight, extra = [], extraNodes = [] }) {
  const copy = ["aud-heading", "point-0", "point-1", "point-2", "point-3", "aud-cta"];
  const from = side === "left" ? -180 : 180;
  return {
    nodes: [
      node(id),
      ...copy.map((c) => node(c, id)),
      node("aud-preview", id),
      node(previewGroup, "aud-preview"),
      ...rows.map((r) => node(r, previewGroup)),
      ...extraNodes,
    ],
    tracks: [
      ...copy.flatMap((c, i) => [
        settle(c, "x", from, 0, 150 + i * 150, 1150 + i * 150),
        fadeIn(c, 150 + i * 150, 750 + i * 150),
      ]),
      ...rows
        .filter((r) => r !== highlight.id)
        .flatMap((r) => {
          const i = rows.indexOf(r);
          return [settle(r, "z", 150, 0, 500 + i * 150, 1300 + i * 150), fadeIn(r, 500 + i * 150, 1000 + i * 150)];
        }),
      ...highlight.tracks,
      ...extra,
    ],
  };
}

{
  const rows = ["sme-head", "doc-0", "doc-1", "doc-2", "doc-3", "sme-foot"];
  const scene = audience("smes", {
    side: "left",
    previewGroup: "sme-card",
    rows,
    highlight: {
      id: "doc-1",
      tracks: [
        // The tax certificate that's about to expire comes out to meet the camera
        kf(surf("doc-1"), "z", [
          [0, 150],
          [800, 150],
          [1600, 0],
          [2700, 0],
          [3500, 300],
        ]),
        kf(surf("doc-1"), "x", [
          [0, 0],
          [2700, 0],
          [3500, -90],
        ]),
        kf(surf("doc-1"), "scale", [
          [0, 1],
          [2700, 1],
          [3500, 1.08],
        ]),
        kf(surf("doc-1"), "rotateY", [
          [0, 0],
          [2700, 0],
          [3500, 8],
        ]),
        fadeIn("doc-1", 800, 1300),
      ],
    },
    extraNodes: [node("sme-match", "aud-preview")],
    extra: [
      settle("aud-preview", "z", -900, 0, 0, 1900),
      settle("aud-preview", "y", 320, 0, 0, 1900),
      settle("aud-preview", "rotateX", 34, 0, 0, 1900),
      // A new match arrives from below, in front of the card
      kf(surf("sme-match"), "y", [
        [0, 240],
        [2900, 240],
        [4100, 0],
      ]),
      kf(surf("sme-match"), "z", [
        [0, 220],
        [2900, 220],
        [4100, 40],
      ]),
      fadeIn("sme-match", 2900, 3500),
      kf(cam, "x", [
        [0, 340],
        [5000, -80],
      ]),
      kf(cam, "y", [
        [0, -90],
        [5000, 100],
      ]),
      kf(cam, "z", [
        [0, -540],
        [2500, -290],
        [5000, -380],
      ]),
      kf(cam, "rotateY", [
        [0, 28],
        [5000, 10],
      ]),
      kf(cam, "rotateX", [
        [0, -6],
        [5000, -14],
      ]),
      kf(focus, "distance", [
        [0, 1020],
        [2500, 1290],
        [2800, 1290],
        [3500, 1000],
        [4100, 1000],
        [4800, 1230],
      ]),
    ],
  });
  write(
    "smes",
    "For SMEs",
    "The SME's card rises into place, the expiring tax certificate lifts out, and a new match arrives.",
    {
      durationMs: 5000,
      camera: { x: 340, y: -90, z: -540, perspective: 1600, rotateX: -6, rotateY: 28 },
      focus: { distance: 1020, fStop: 4, focalLength: 100, maxBlur: 6 },
      ...scene,
    },
  );
}

{
  const rows = ["opp-head", "opp-scoring", "opp-docs", "opp-foot"];
  const scene = audience("buyers", {
    side: "right",
    previewGroup: "opp",
    rows,
    highlight: {
      id: "opp-scoring",
      tracks: [
        // How it's scored lifts out, tilts towards the camera, and goes back
        kf(surf("opp-scoring"), "z", [
          [0, 150],
          [650, 150],
          [1450, 0],
          [2600, 0],
          [3300, 300],
          [4200, 300],
          [4900, 40],
        ]),
        kf(surf("opp-scoring"), "rotateX", [
          [0, 0],
          [2600, 0],
          [3300, -8],
          [4900, 0],
        ]),
        fadeIn("opp-scoring", 650, 1150),
      ],
    },
    extra: [
      settle("aud-preview", "x", -1000, 0, 0, 1900),
      settle("aud-preview", "z", -500, 0, 0, 1900),
      settle("aud-preview", "rotateY", 44, 0, 0, 1900),
      kf(cam, "x", [
        [0, -240],
        [5000, 260],
      ]),
      kf(cam, "y", [
        [0, 60],
        [5000, -60],
      ]),
      kf(cam, "z", [
        [0, -60],
        [2600, -540],
        [5000, -450],
      ]),
      kf(cam, "rotateY", [
        [0, 30],
        [5000, 12],
      ]),
      kf(cam, "rotateX", [
        [0, 14],
        [5000, 4],
      ]),
      kf(focus, "distance", [
        [0, 1520],
        [2600, 1060],
        [2700, 1060],
        [3300, 770],
        [4200, 770],
        [4900, 1110],
      ]),
    ],
  });
  write(
    "buyers",
    "For buyers",
    "The buyer's opportunity swings in from the left and its scoring lifts out for a closer look.",
    {
      durationMs: 5000,
      camera: { x: -240, y: 60, z: -60, perspective: 1600, rotateX: 14, rotateY: 30 },
      focus: { distance: 1520, fStop: 4, focalLength: 100, maxBlur: 6 },
      ...scene,
    },
  );
}

/* 4. How it works: four steps arrive from four directions, then each one pulses forward in turn. */
{
  const entries = [
    { x: -760, y: 0, rotateY: -55, rotateX: 0 },
    { x: 0, y: 560, rotateY: 0, rotateX: 55 },
    { x: 0, y: -560, rotateY: 0, rotateX: -55 },
    { x: 760, y: 0, rotateY: 55, rotateX: 0 },
  ];
  const tracks = [
    settle("heading", "y", -140, 0, 0, 1300),
    fadeIn("heading", 0, 900),
    ...entries.flatMap((e, i) => {
      const id = `step-${i}`;
      const start = 250 + i * 330;
      const end = start + 1500;
      const pulse = 3000 + i * 300;
      return [
        settle(id, "x", e.x, 0, start, end),
        settle(id, "y", e.y, 0, start, end),
        settle(id, "rotateY", e.rotateY, 0, start, end),
        settle(id, "rotateX", e.rotateX, 0, start, end),
        kf(surf(id), "z", [
          [0, -420],
          [start, -420],
          [end, 0],
          [pulse, 0],
          [pulse + 400, 170],
          [pulse + 900, 0],
        ]),
        fadeIn(id, start, start + 700),
      ];
    }),
    kf(cam, "x", [
      [0, -220],
      [5200, 170],
    ]),
    kf(cam, "y", [
      [0, 70],
      [5200, -30],
    ]),
    kf(cam, "z", [
      [0, -100],
      [5200, -300],
    ]),
    kf(cam, "rotateY", [
      [0, -22],
      [5200, 12],
    ]),
    kf(cam, "rotateX", [
      [0, 14],
      [5200, 6],
    ]),
  ];
  write(
    "steps",
    "How it works",
    "Post, match, evaluate and decide arrive from four directions and step forward in turn.",
    {
      durationMs: 5200,
      camera: { x: -220, y: 70, z: -100, perspective: 1600, rotateX: 14, rotateY: -22 },
      focus: { distance: 1500, fStop: 5.6, focalLength: 100, maxBlur: 6 },
      nodes: [node("board"), node("heading", "board"), ...[0, 1, 2, 3].map((i) => node(`step-${i}`, "board"))],
      tracks,
    },
  );
}

/* 5. Fairness: the record swings in, its entries drop into place, the award lifts out, the laws rise. */
{
  const trail = [0, 1, 2, 3, 4].map((i) => `trail-${i}`);
  const laws = [0, 1, 2, 3].map((i) => `law-${i}`);
  const tracks = [
    settle("fair-heading", "x", -220, 0, 0, 1300),
    fadeIn("fair-heading", 0, 900),
    settle("record", "x", 640, 0, 0, 1700),
    settle("record", "z", -640, 0, 0, 1700),
    settle("record", "rotateY", -34, 0, 0, 1700),
    fadeIn("record-label", 1100, 1600),
    ...trail
      .slice(0, 4)
      .flatMap((id, i) => [
        settle(id, "z", 190, 0, 1300 + i * 280, 2100 + i * 280),
        fadeIn(id, 1300 + i * 280, 1700 + i * 280),
      ]),
    // The award: settles last, then comes forward
    kf(surf("trail-4"), "z", [
      [0, 190],
      [2420, 190],
      [3220, 0],
      [3700, 0],
      [4500, 270],
    ]),
    kf(surf("trail-4"), "scale", [
      [0, 1],
      [3700, 1],
      [4500, 1.04],
    ]),
    fadeIn("trail-4", 2420, 2820),
    ...laws.flatMap((id, i) => [
      settle(id, "y", 260, 0, 2700 + i * 260, 3800 + i * 260),
      settle(id, "z", -320, 0, 2700 + i * 260, 3800 + i * 260),
      fadeIn(id, 2700 + i * 260, 3200 + i * 260),
    ]),
    kf(cam, "y", [
      [0, -320],
      [5600, 300],
    ]),
    kf(cam, "x", [
      [0, 170],
      [5600, -130],
    ]),
    kf(cam, "z", [
      [0, -360],
      [2800, -540],
      [5600, -420],
    ]),
    kf(cam, "rotateX", [
      [0, -16],
      [5600, -5],
    ]),
    kf(cam, "rotateY", [
      [0, 12],
      [5600, -10],
    ]),
    kf(focus, "distance", [
      [0, 1240],
      [2800, 1060],
      [3700, 1060],
      [4400, 830],
      [4900, 830],
      [5600, 1160],
    ]),
  ];
  write(
    "fairness",
    "The fairness layer",
    "The decision record swings in, the award lifts out of it, and the four laws rise beneath.",
    {
      durationMs: 5600,
      camera: { x: 170, y: -320, z: -360, perspective: 1600, rotateX: -16, rotateY: 12 },
      focus: { distance: 1240, fStop: 4, focalLength: 100, maxBlur: 6 },
      nodes: [
        node("fairness"),
        node("fair-heading", "fairness"),
        node("record-label", "fairness"),
        node("record", "fairness"),
        ...trail.map((id) => node(id, "record")),
        node("laws", "fairness"),
        ...laws.map((id) => node(id, "laws")),
      ],
      tracks,
    },
  );
}

/* 6. Coverage: starts on the map, pulls back as the live figures drop in, then the map lifts out. */
{
  const figures = [0, 1, 2].map((i) => `figure-${i}`);
  const tracks = [
    settle("cov-heading", "y", -90, 0, 600, 1700),
    fadeIn("cov-heading", 600, 1300),
    fadeIn("cov-live", 1000, 1600),
    ...figures.flatMap((id, i) => [
      settle(id, "z", 200, 0, 900 + i * 250, 1800 + i * 250),
      fadeIn(id, 900 + i * 250, 1400 + i * 250),
    ]),
    fadeIn("cov-toggle", 1400, 2000),
    kf(surf("cov-map"), "z", [
      [0, 0],
      [2300, 0],
      [3400, 270],
    ]),
    kf(surf("cov-map"), "rotateX", [
      [0, 0],
      [2300, 0],
      [3400, -7],
    ]),
    kf(cam, "x", [
      [0, -170],
      [5000, 60],
    ]),
    kf(cam, "y", [
      [0, 250],
      [5000, 20],
    ]),
    kf(cam, "z", [
      [0, -780],
      [2400, -300],
      [5000, -370],
    ]),
    kf(cam, "rotateY", [
      [0, -24],
      [5000, -6],
    ]),
    kf(cam, "rotateX", [
      [0, 16],
      [5000, 8],
    ]),
    kf(focus, "distance", [
      [0, 820],
      [2400, 1260],
      [2600, 1260],
      [3400, 990],
      [5000, 990],
    ]),
  ];
  write(
    "coverage",
    "Across South Africa",
    "Opens on the live province map, pulls back as the national figures drop in, then lifts the map out.",
    {
      durationMs: 5000,
      camera: { x: -170, y: 250, z: -780, perspective: 1600, rotateX: 16, rotateY: -24 },
      focus: { distance: 820, fStop: 4, focalLength: 100, maxBlur: 6 },
      nodes: [
        node("coverage"),
        node("cov-heading", "coverage"),
        node("cov-live", "coverage"),
        node("cov-card", "coverage"),
        ...figures.map((id) => node(id, "cov-card")),
        node("cov-toggle", "cov-card"),
        node("cov-map", "cov-card"),
      ],
      tracks,
    },
  );
}

/* 7. Finale: the logo comes in towards the viewer, the call to action rises from depth beneath it. */
{
  const tracks = [
    settle("logo", "z", 220, 0, 0, 1900),
    settle("logo", "scale", 1.08, 1, 0, 1900),
    fadeIn("logo", 0, 1100),
    settle("cta-panel", "z", -600, 0, 500, 2600),
    settle("cta-panel", "y", 160, 0, 500, 2600),
    settle("cta-panel", "rotateX", 14, 0, 500, 2600),
    kf(surf("cta-copy"), "z", [
      [0, 0],
      [2600, 0],
      [3400, 60],
    ]),
    kf(surf("cta-actions"), "z", [
      [0, 0],
      [2800, 0],
      [3600, 100],
    ]),
    kf(cam, "z", [
      [0, -40],
      [4600, -300],
    ]),
    kf(cam, "x", [
      [0, -90],
      [4600, 60],
    ]),
    kf(cam, "rotateY", [
      [0, -8],
      [4600, 2],
    ]),
    kf(cam, "rotateX", [
      [0, 2],
      [4600, 8],
    ]),
  ];
  write(
    "finale",
    "Get started",
    "The logo comes in towards the viewer and the call to action rises from depth beneath it.",
    {
      durationMs: 4600,
      camera: { x: -90, y: 0, z: -40, perspective: 1600, rotateX: 2, rotateY: -12 },
      focus: { distance: 1500, fStop: 8, focalLength: 100, maxBlur: 5 },
      nodes: [
        node("stage"),
        node("logo", "stage"),
        node("cta-panel", "stage"),
        node("cta-copy", "cta-panel"),
        node("cta-actions", "cta-panel"),
      ],
      tracks,
    },
  );
}

console.log("recipes written");

/* ------------------------------------------------------------------------------------------------------ */
/* The dashboards: the real portal screens, signed in, each with one calm move and one or two lifts.     */
/* ------------------------------------------------------------------------------------------------------ */

/** Shell nodes, plus the page's own blocks under "page". */
const appNodes = (blocks) => [
  node("app"),
  node("sidebar", "app"),
  node("topbar", "app"),
  node("page", "app"),
  ...blocks.map((id) => node(id, "page")),
];
/** The screen settles from just behind where it rests. */
const arrive = [settle("app", "z", -300, 0, 0, 1800)];

/* SME portal: the sidebar floats off the page, then the readiness band comes forward. */
write(
  "sme-portal",
  "SME portal",
  "The SME's dashboard: the sidebar floats off the page and the readiness band comes forward.",
  {
    durationMs: 5000,
    camera: { x: -360, y: -80, z: -380, perspective: 1600, rotateX: 6, rotateY: -18 },
    focus: { distance: 1220, fStop: 5.6, focalLength: 100, maxBlur: 6 },
    nodes: appNodes([
      "page-heading",
      "stats",
      "section-profile-readiness",
      "section-documents",
      "section-where-you-re-matched",
      "section-latest-matches",
    ]),
    tracks: [
      ...arrive,
      kf(surf("sidebar"), "z", [
        [0, 0],
        [1600, 0],
        [2800, 120],
      ]),
      kf(surf("stats"), "z", [
        [0, 0],
        [2600, 0],
        [3600, 90],
      ]),
      kf(cam, "x", [
        [0, -360],
        [5000, 140],
      ]),
      kf(cam, "y", [
        [0, -80],
        [5000, -20],
      ]),
      kf(cam, "rotateY", [
        [0, -18],
        [5000, -12],
      ]),
      kf(focus, "distance", [
        [0, 1220],
        [2800, 1150],
        [3600, 1130],
        [5000, 1150],
      ]),
    ],
  },
);

/* Buyer overview: the figures come forward, then the opportunities that need attention. */
write(
  "buyer-overview",
  "Buyer dashboard",
  "The buyer's dashboard: its figures come forward, then the opportunities that need attention.",
  {
    durationMs: 5000,
    camera: { x: 320, y: -90, z: -380, perspective: 1600, rotateX: 6, rotateY: 16 },
    focus: { distance: 1220, fStop: 5.6, focalLength: 100, maxBlur: 6 },
    nodes: appNodes([
      "page-heading",
      "stats",
      "section-applicants-per-opportunity",
      "section-needs-attention",
      "section-your-opportunities",
    ]),
    tracks: [
      ...arrive,
      kf(surf("stats"), "z", [
        [0, 0],
        [1900, 0],
        [2800, 70],
      ]),
      kf(surf("section-needs-attention"), "z", [
        [0, 0],
        [2600, 0],
        [3600, 160],
      ]),
      kf(surf("section-needs-attention"), "x", [
        [0, 0],
        [2600, 0],
        [3600, -30],
      ]),
      kf(cam, "x", [
        [0, 320],
        [5000, -60],
      ]),
      kf(cam, "rotateY", [
        [0, 16],
        [5000, 10],
      ]),
      kf(focus, "distance", [
        [0, 1220],
        [2600, 1220],
        [3600, 1060],
        [5000, 1060],
      ]),
    ],
  },
);

/* Applicants: down the opportunity to its shortlisting, which comes forward, then the ranked applicants. */
write(
  "buyer-applicants",
  "Applicants",
  "Down one opportunity: its shortlisting comes forward, then the ranked applicants.",
  {
    durationMs: 5200,
    camera: { x: -120, y: -420, z: -380, perspective: 1600, rotateX: -10, rotateY: -12 },
    focus: { distance: 1220, fStop: 5.6, focalLength: 100, maxBlur: 6 },
    nodes: appNodes(["opp-back", "page-heading", "opp-facts", "stats", "opp-tabs", "opp-evaluation", "opp-applicants"]),
    tracks: [
      settle("app", "z", -300, 0, 0, 1500),
      kf(surf("opp-evaluation"), "z", [
        [0, 0],
        [1800, 0],
        [2700, 150],
        [3700, 150],
        [4400, 0],
      ]),
      kf(surf("opp-applicants"), "z", [
        [0, 0],
        [3500, 0],
        [4500, 130],
      ]),
      kf(cam, "y", [
        [0, -420],
        [5200, 330],
      ]),
      kf(cam, "x", [
        [0, -120],
        [5200, 80],
      ]),
      kf(cam, "rotateY", [
        [0, -12],
        [5200, -8],
      ]),
      kf(focus, "distance", [
        [0, 1220],
        [1800, 1220],
        [2700, 1070],
        [3700, 1070],
        [4500, 1090],
        [5200, 1090],
      ]),
    ],
  },
);

/* Admin analytics: down from the platform's figures to the province map, which comes forward. */
write(
  "admin-analytics",
  "Analytics",
  "MASLink's own analytics: down from the platform figures to the province map, which comes forward.",
  {
    durationMs: 5600,
    camera: { x: 140, y: -560, z: -400, perspective: 1600, rotateX: -8, rotateY: 10 },
    focus: { distance: 1200, fStop: 5.6, focalLength: 100, maxBlur: 6 },
    nodes: appNodes([
      "page-heading",
      "stats",
      "section-activity-over-time",
      "section-across-south-africa",
      "section-from-application-to-award",
      "section-automated-shortlisting",
      "section-application-outcomes",
      "section-scores",
      "section-opportunities-by-type",
      "section-smes-by-b-bbee-level",
      "section-smes-by-industry",
    ]),
    tracks: [
      ...arrive,
      kf(surf("section-across-south-africa"), "z", [
        [0, 0],
        [3000, 0],
        [4200, 170],
      ]),
      kf(cam, "y", [
        [0, -560],
        [5600, 40],
      ]),
      kf(cam, "x", [
        [0, 140],
        [5600, -100],
      ]),
      kf(cam, "rotateY", [
        [0, 10],
        [5600, 6],
      ]),
      kf(focus, "distance", [
        [0, 1200],
        [3000, 1200],
        [4200, 1030],
        [5600, 1030],
      ]),
    ],
  },
);

console.log("dashboard recipes written");
