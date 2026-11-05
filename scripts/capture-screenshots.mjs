#!/usr/bin/env node
/**
 * Regenerates the README images in docs/images from the real demo.
 *
 *   npm run build && npm run screenshots
 *
 * Needs Playwright with Chromium (`npx playwright install chromium`), and
 * ffmpeg for the animated walkthrough (skipped with a note if missing).
 * Options: --url <running demo URL>  --no-gif
 */
// Code passed to page.evaluate() runs in the browser.
/* global document */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs/images");
const args = process.argv.slice(2);
const urlArg = args.includes("--url") ? args[args.indexOf("--url") + 1] : undefined;
const makeGif = !args.includes("--no-gif");

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error(
    "Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium",
  );
  process.exit(1);
}

// --- Serve the built demo ------------------------------------------------------
let server;
async function startServer() {
  if (urlArg) return urlArg.replace(/\/?$/, "/");
  const port = 4317;
  server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
    cwd: join(root, "apps/demo"),
    stdio: "ignore",
  });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("The demo preview server did not start. Did you run `npm run build`?");
}

// --- Helpers ---------------------------------------------------------------------

/** A visible cursor, because recorded videos don't show the real one. */
const CURSOR = `
  const c = document.createElement("div");
  c.id = "demo-cursor";
  Object.assign(c.style, {
    position: "fixed", left: "0", top: "0", width: "22px", height: "22px", zIndex: 9999,
    borderRadius: "50%", background: "rgba(242,184,75,.85)", border: "2px solid #fff",
    boxShadow: "0 2px 8px rgba(0,0,0,.3)", pointerEvents: "none",
    transform: "translate(600px, 500px)", transition: "transform .45s ease",
  });
  document.body.append(c);`;

function page(browser, opts) {
  return browser.newPage({ deviceScaleFactor: 2, ...opts });
}

async function click(p, locator, { cursor = false } = {}) {
  const el = locator.first();
  if (cursor) {
    const box = await el.boundingBox();
    await p.evaluate(
      ([x, y]) => {
        const c = document.getElementById("demo-cursor");
        if (c) c.style.transform = `translate(${x - 11}px, ${y - 11}px)`;
      },
      [box.x + Math.min(box.width / 2, 60), box.y + box.height / 2],
    );
    await p.waitForTimeout(500);
  }
  await el.click();
  if (cursor) await p.waitForTimeout(450);
}

const byName = (p, name) => p.getByRole("button", { name, exact: typeof name === "string" });

/** Answer the interview for a head of household with one child, earning $27,500. */
async function interview(p, { cursor = false, typeDelay = 0 } = {}) {
  const tap = (name) => click(p, byName(p, name), { cursor });
  const typeIn = async (text) => {
    await p.getByRole("textbox").first().fill("");
    await p.getByRole("textbox").first().pressSequentially(text, { delay: typeDelay });
    await tap("Continue");
  };
  const steps = [
    [/claim you as a dependent/, () => tap("No")],
    [/Do you have a Social Security/, () => tap("Yes")],
    [/filing status/, () => tap(/^Head of household/)],
    [/citizen or resident alien/, () => tap("Yes")],
    [
      /Add each child/,
      async () => {
        await tap(/Add a child/);
        await p.keyboard.type("Maya", { delay: typeDelay });
        await tap("Continue");
      },
    ],
    [/How is Maya related/, () => tap(/^Son or daughter/)],
    [/How old was Maya/, () => typeIn("7")],
    [/How old were you/, () => typeIn("34")],
    [/Did Maya live with you/, () => tap("Yes")],
    [/Will someone else/, () => tap("No")],
    [/Did Maya pay/, () => tap("No")],
    [/Is Maya a U.S. citizen/, () => tap("Yes")],
    [/Does Maya have a Social Security/, () => tap("Yes")],
    [/earn from jobs/, () => typeIn("27500")],
    [/work for yourself/, () => tap("No")],
    [/investment income/, () => typeIn("0")],
    [/other taxable income/, () => tap("No")],
    [/main home in the United States/, () => tap("Yes")],
  ];
  for (let i = 0; i < 30; i++) {
    if (await p.getByText("How we worked it out").count()) return;
    const prompt = (await p.getByRole("heading", { level: 1 }).textContent()) ?? "";
    const step = steps.find(([re]) => re.test(prompt));
    if (!step) throw new Error(`Unexpected question: ${prompt}`);
    await step[1]();
  }
}

/** Screenshot from the top of the page down to the end of an element. */
async function shotTo(p, file, selector, extra = 24) {
  const box = await p.locator(selector).first().boundingBox();
  const width = p.viewportSize().width;
  await p.screenshot({
    path: join(out, file),
    clip: { x: 0, y: 0, width, height: Math.ceil(box.y + box.height + extra) },
  });
}

// --- Captures --------------------------------------------------------------------------
async function captureScreens(browser, base) {
  for (const scheme of ["light", "dark"]) {
    const suffix = scheme === "dark" ? "-dark" : "";
    const p = await page(browser, { viewport: { width: 1200, height: 900 }, colorScheme: scheme });
    await p.goto(base);

    // A question about one child, with the live "So far" panel.
    await click(p, byName(p, "Start"));
    await click(p, byName(p, "No"));
    await click(p, byName(p, "Yes"));
    await click(p, byName(p, /^Head of household/));
    await click(p, byName(p, "Yes"));
    await click(p, byName(p, /Add a child/));
    await p.keyboard.type("Maya");
    await click(p, byName(p, "Continue"));
    await p.mouse.move(0, 0);
    await shotTo(p, `question${suffix}.png`, ".layout");

    // Results for an example household, first card fully explained.
    await p.goto(base);
    await click(p, p.getByRole("button", { name: "Factfinch home" }));
    await click(p, byName(p, /Mixed household/));
    await shotTo(p, `results${suffix}.png`, ".card.result");
    await p.close();
  }
}

async function capturePhones(browser, base) {
  const dir = mkdtempSync(join(tmpdir(), "factfinch-shots-"));
  const p = await page(browser, {
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await p.goto(base);
  await p.screenshot({ path: join(dir, "1.png") });
  await click(p, byName(p, "Start"));
  await click(p, byName(p, "No"));
  await click(p, byName(p, "Yes"));
  await p.screenshot({ path: join(dir, "2.png") });
  await p.goto(base);
  await click(p, p.getByRole("button", { name: "Factfinch home" }));
  await click(p, byName(p, /Head of household, one child/));
  await p.screenshot({ path: join(dir, "3.png") });
  await p.close();

  // Lay the three phones side by side.
  const html = join(dir, "phones.html");
  writeFileSync(
    html,
    `<!doctype html><body style="margin:0;background:#f5f4ef;display:flex;gap:40px;justify-content:center;padding:40px 48px">
      ${[1, 2, 3]
        .map(
          (n) =>
            `<img src="${n}.png" style="width:390px;border-radius:36px;border:10px solid #1b2220;box-shadow:0 20px 40px rgba(0,0,0,.18)">`,
        )
        .join("")}
    </body>`,
  );
  const sheet = await page(browser, {
    viewport: { width: 1426, height: 880 },
    deviceScaleFactor: 1,
  });
  await sheet.goto(`file://${html}`);
  await sheet.screenshot({ path: join(out, "phones.png") });
  await sheet.close();
  rmSync(dir, { recursive: true, force: true });
}

async function captureWalkthrough(browser, base) {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
    console.warn("ffmpeg not found: skipping walkthrough.gif");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "factfinch-video-"));
  const size = { width: 1100, height: 640 };
  const ctx = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
  const p = await ctx.newPage();
  await p.goto(base);
  await p.evaluate(CURSOR);
  await p.waitForTimeout(900);
  // The app never reloads the page, so the cursor survives every screen.
  await click(p, byName(p, "Start"), { cursor: true });
  await interview(p, { cursor: true, typeDelay: 70 });
  await p.waitForTimeout(1200);
  await p.mouse.wheel(0, 380);
  await p.waitForTimeout(900);
  await click(p, p.getByText("Your earned income (pay from work plus self-employment)"), {
    cursor: true,
  });
  await p.waitForTimeout(1800);
  await ctx.close();

  const video = join(
    dir,
    readdirSync(dir).find((f) => f.endsWith(".webm")),
  );
  const gif = join(out, "walkthrough.gif");
  // Flat UI colors need no dithering; that keeps the GIF small.
  const filters = "setpts=PTS/1.6,fps=10,scale=760:-1:flags=lanczos";
  spawnSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    video,
    "-vf",
    `${filters},palettegen=max_colors=64:stats_mode=diff`,
    join(dir, "palette.png"),
  ]);
  spawnSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    video,
    "-i",
    join(dir, "palette.png"),
    "-lavfi",
    `${filters} [x]; [x][1:v] paletteuse=dither=none:diff_mode=rectangle`,
    "-loop",
    "0",
    gif,
  ]);
  rmSync(dir, { recursive: true, force: true });
}

// --- Run -------------------------------------------------------------------------------
mkdirSync(out, { recursive: true });
const base = await startServer();
const browser = await chromium.launch();
try {
  await captureScreens(browser, base);
  await capturePhones(browser, base);
  if (makeGif) await captureWalkthrough(browser, base);
} finally {
  await browser.close();
  server?.kill();
}
for (const f of readdirSync(out).sort()) {
  console.log(`${f.padEnd(24)} ${(statSync(join(out, f)).size / 1024).toFixed(0).padStart(5)} KB`);
}
