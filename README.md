# Problems

## Drei
>Blink animation when change direction with useEffect (onLoopEnd, playBackwards)  
*Temporary solution: add frames in data.json in animation*

# Deploy

Vercel: https://worms-js.vercel.app/


# Stage 1: terrain sandbox

Run `npm run dev`, then open http://localhost:3000.

- Hold **A / D** to pan, **R** to generate a new terrain and wind, **left click** to carve a radius-38 crater.
- The cursor outline marks the crater radius. Amber means a radius-6 collision probe at its center touches ground; green means it is clear.
- The wind HUD stays fixed to the screen. Debris moves with the same stable signed wind value.

The existing orthographic React Three Fiber scene, Background, Air, Cloud, Water, Wave and Bubble are retained. Terrain is a one-unit occupancy bitmap in a standalone TypeScript model; React only orchestrates rendering. World width is 2.25 viewport widths. Coordinates are centered with +Y up, independently of camera position. Outside the mask is empty (a circle can still overlap ground across a boundary).

`src/entities/Terrain/model/terrain.ts` exposes `isSolid`, `heightAt`, `collideCircle`, and `destroyCircle`. `heightAt` returns the highest remaining solid cell's top edge, or null for empty/outside columns. Initial heights are immutable after generation. Seeded smooth value-noise octaves create a single ground mass with no caves. Destruction tests cell centers inside the circle, at one-unit raster resolution. Contact normals/depth are approximate raster contacts, not a continuous rigid-body solver. Deeply embedded collision queries search for an escape boundary and cost more than normal surface contacts.

`src/entities/Terrain/ui/terrainTiles.ts` renders 128x128 tiles from a repeating local dirt/stone pattern and an original-surface crust. Dirty notifications update only affected alpha pixels and upload only touched tiles. Colors do not regenerate grass on crater walls. There are no physics engines, quadtrees, per-cell components or per-click React state updates. Procedural colors are replaceable placeholder art; no additional Worms assets were imported.

`src/entities/World/model/world.ts` exposes world dimensions, `waterLevel` and normalized `wind`. `src/widgets/World/ui/WorldScene.tsx` contains removable debug camera/destruction controls and recycled ambient particles. Resizing regenerates a world at the new viewport dimensions with the current seed, clearing craters and resetting the camera. R changes both seed and wind. No gameplay systems beyond Stage 1 are included.

Checks: `npm test` (Node's built-in test runner, no additional dependencies), `npm run typecheck`, `npm run lint`, `npm run build`. Tests cover seeded generation, solid/empty boundaries, surfaces, overlapping destruction, live collisions, dirty regions, camera bounds, world reset, and exact rendered alpha/mask agreement after 100 craters. The printed CPU duration excludes GPU uploads and ambient rendering; browser testing is also required to assess overall frame rate.
