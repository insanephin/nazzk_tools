import * as esbuild from "esbuild";
import { cp, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await cp("public", outdir, { recursive: true });

const options = {
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    cafe: "src/cafe.ts",
    pageHook: "src/pageHook.ts",
    "popup/popup": "src/popup/popup.ts",
    "steam/player": "src/steam/player.ts",
  },
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
