# Problems

## Drei
>Blink animation when change direction with useEffect (onLoopEnd, playBackwards)  
*Temporary solution: add frames in data.json in animation*

# Deploy

Vercel: https://worms-js.vercel.app/


# Stage 1: terrain sandbox

Install dependencies with `npm ci` after updating the checkout, then run `npm run dev` and open http://localhost:3000. The application runs on Next.js with Webpack (required for the GLSL loader); Vite is only used by Vitest. Stop an existing dev server with Ctrl+C in its terminal before starting another one in this checkout. A second port still shares Next's dev lock.

If React reports a body-attribute hydration mismatch containing `wotdisconnected`, a browser extension has modified the HTML before hydration. Disable that extension for localhost or verify in an extension-free browser profile; the application does not blanket-suppress hydration diagnostics.

- Hold **A / D** to pan, **R** to generate a new terrain and wind, **left click** to carve a radius-38 crater.
- The cursor outline marks the crater radius. Amber means a radius-6 collision probe at its center touches ground; green means it is clear.
- The wind HUD stays fixed to the screen. Debris falls downward and drifts with the same stable signed wind value; calm weather gives vertical fall. The meter uses blue left-pointing and red right-pointing triangles. Bubbles rise with a gentle sideways drift.

The existing orthographic React Three Fiber scene, Background, Air, Cloud, Water, Wave and Bubble are retained. Three narrow wave bands use world-space wavelengths and width-dependent horizontal tessellation; time updates the actual shader material uniforms, so motion continues after R3F uniform merging. Terrain is a one-unit occupancy bitmap in a standalone TypeScript model; React only orchestrates rendering. World width is 2.25 viewport widths. Coordinates are centered with +Y up, independently of camera position. Outside the mask is empty (a circle can still overlap ground across a boundary).

`src/entities/Terrain/model/terrain.ts` exposes `isSolid`, `heightAt`, `collideCircle`, and `destroyCircle`. `heightAt` returns the highest remaining solid cell's top edge, or null for empty/outside columns. Initial heights are immutable after generation. Seeded smooth value-noise octaves create a single island with no caves. Ocean margins occupy 10% at each end; smooth shores enter the water well before the world bounds. Destruction tests cell centers inside the circle, at one-unit raster resolution. Contact normals/depth are approximate raster contacts, not a continuous rigid-body solver. Deeply embedded collision queries search for an escape boundary and cost more than normal surface contacts.

`src/entities/Terrain/ui/terrainTiles.ts` renders 128x128 tiles from a repeating local dirt/stone pattern and an original-surface crust. Dirty notifications update only affected alpha pixels and upload only touched tiles. Colors do not regenerate grass on crater walls. There are no physics engines, quadtrees, per-cell components or per-click React state updates. Procedural colors are replaceable placeholder art; no additional Worms assets were imported.

`src/entities/World/model/world.ts` exposes world dimensions, `waterLevel` and normalized `wind`. `src/widgets/World/ui/WorldScene.tsx` contains removable debug camera/destruction controls and recycled ambient particles. Resizing regenerates a world at the new viewport dimensions with the current seed, clearing craters and resetting the camera. R changes both seed and wind. No gameplay systems beyond Stage 1 are included.

Checks: `npm test` (Vitest), `npm run typecheck`, `npm run build`; staged lint/format checks run automatically on commit. Tests cover seeded generation, solid/empty boundaries, surfaces, overlapping destruction, live collisions, dirty regions, camera bounds, world reset, and exact rendered alpha/mask agreement after 100 craters. The printed CPU duration excludes GPU uploads and ambient rendering; browser testing is also required to assess overall frame rate.

# Development tooling

Use Node 22.12+, Node 24, or Node 26+ and `npm ci`. The `prepare` lifecycle installs Lefthook; pre-commit runs Biome only on staged JS/TS/JSON/CSS files. Safe fixes are applied and restaged; unstaged files are not checked. Lefthook preserves unstaged hunks in partially staged files. There is no full-project lint or test run in pre-commit. Unsupported assets and generated output are excluded.

`npm test` runs the terrain suite with Vitest; `npm run test:watch` starts watch mode. `npm run typecheck` and `npm run build` are separate verification commands. `npm run lint` is available as a staged-only manual check when needed, and `npm run format` explicitly formats the project. Biome replaces ESLint, Stylelint and Prettier. The old SCSS contained only standard CSS and is now plain CSS so the same formatter/linter covers styles.

Next.js 16 uses the existing Webpack shader loader via `--webpack`; static export and GitHub Pages deployment commands remain available. React/React DOM are kept at the same version, and R3F/Drei/Three are updated together and validated with the scene.

Dependency audit: Next.js 16.3.8 includes the September 30, 2026 security release. Prisma 6 retains its existing API with a scoped `deepmerge-ts` 8 override for `@prisma/config`; schema configuration now lives in `prisma.config.ts`, and `prisma generate` validates the toolchain without connecting to a database. `gh-pages` is pinned to 6.1.1, the audit-recommended compatible release, because 6.3.0 pulls in an unpatched `braces` dependency. `npm audit` reports zero advisories for this dependency tree. Deployment itself is not invoked by verification.
