# Worms.js

Worms.js is a small, non-commercial browser game inspired by Worms Armageddon. The aim is to recreate a simplified version of the classic Worms feel in the browser: tiny teams, careful shots and a destructible island.

This is an unofficial fan project, made with respect for Team17 and the original creators. It is not affiliated with or endorsed by Team17.

## Play

[Play Worms.js in your browser](https://ragna13377.github.io/worms-js/)

## Features

- Destructible terrain.
- Bazooka and Grenade, with wind, explosions, knockback and fall damage.
- Worms-style movement, aiming, charging and grenade fuse controls.
- 1v1, 2v2 and 3v3 teams.
- Local hot-seat and a Medium bot.
- Online private rooms through an invite link, with reconnect recovery and a live ping indicator.
- Local save/load for offline modes.
- Animated worms and a classic-inspired presentation.

## Tech

TypeScript, React, Next.js, Three.js, React Three Fiber, Drei, WebGL and GLSL, with Cloudflare Workers, Durable Objects and WebSockets for online play. Gameplay uses a custom deterministic fixed-step simulation; online matches synchronize validated input instead of streaming the entire world every frame.

## Implementation notes

- Destructible raster terrain is rendered through dynamic Three.js textures.
- Worms and projectiles run in a deterministic simulation.
- Online gameplay prefers direct WebRTC; Cloudflare handles lobby, signaling, recovery, fallback and state hash checkpoints.
- Clients replay the committed input history to recover after reconnects or synchronization errors.
