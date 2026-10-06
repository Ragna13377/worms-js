import { Background } from '@entities/Background';
import { seededRandom } from '@entities/Terrain/model/terrain';
import { Terrain } from '@entities/Terrain/ui/Terrain';
import { advanceWindParticles } from '@entities/World/model/particles';
import { worldLayout } from '@entities/World/model/presentation';
import { CRATER_RADIUS, type GameWorld } from '@entities/World/model/world';
import { useFrame } from '@react-three/fiber';
import { Air } from '@widgets/Air';
import { Gameplay } from '@widgets/Gameplay/ui/Gameplay';
import { Water } from '@widgets/Water';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import {
	type BufferAttribute,
	type Mesh,
	type MeshBasicMaterial,
	type Points,
	Vector3,
} from 'three';
import { sceneColors } from '../constants';

function WindParticles({ world }: { world: GameWorld }) {
	const ref = useRef<Points>(null);
	const particles = useMemo(() => {
		const top = worldLayout(world).debrisTop;
		const random = seededRandom(world.seed ^ 0xd057);
		const count = Math.max(30, Math.ceil(world.width / 24));
		const positions = new Float32Array(count * 3);
		const speeds = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			positions[i * 3] = (random() - 0.5) * world.width;
			positions[i * 3 + 1] = world.waterLevel + random() * (top - world.waterLevel);
			positions[i * 3 + 2] = 2;
			speeds[i] = 0.65 + random() * 0.7;
		}
		return { positions, speeds };
	}, [world]);
	useFrame((_, delta) => {
		const { positions, speeds } = particles;
		advanceWindParticles(
			positions,
			speeds,
			world.wind,
			world.width,
			worldLayout(world).debrisTop,
			world.waterLevel,
			delta
		);
		if (ref.current)
			(ref.current.geometry.attributes.position as BufferAttribute).needsUpdate = true;
	});
	return (
		<points ref={ref} frustumCulled={false}>
			<bufferGeometry>
				<bufferAttribute attach='attributes-position' args={[particles.positions, 3]} />
			</bufferGeometry>
			<pointsMaterial
				color='#d9c6a2'
				size={2}
				sizeAttenuation={false}
				transparent
				opacity={0.55}
				depthWrite={false}
			/>
		</points>
	);
}

/** Cursor ring probes the live mask; green is empty, amber is contact. */
function DebugDestruction({ world }: { world: GameWorld }) {
	const probe = useRef<Mesh>(null);
	const cursor = useRef({ x: 0, y: 0, visible: false, dirty: true });
	const worldPointer = useMemo(() => new Vector3(), []);
	useEffect(() => {
		cursor.current.dirty = true;
		return world.terrain.subscribe(() => {
			cursor.current.dirty = true;
		});
	}, [world]);
	useFrame(({ camera, pointer }) => {
		if (!probe.current) return;
		worldPointer.set(pointer.x, pointer.y, 0).unproject(camera);
		if (worldPointer.x !== cursor.current.x || worldPointer.y !== cursor.current.y) {
			cursor.current.x = worldPointer.x;
			cursor.current.y = worldPointer.y;
			cursor.current.dirty = true;
		}
		probe.current.visible = false;
		probe.current.position.set(cursor.current.x, cursor.current.y, 19);
		if (!cursor.current.dirty || !cursor.current.visible) return;
		cursor.current.dirty = false;
		// Embedded centers already guarantee contact; avoid a deep escape-normal
		// search just to color a debug cursor.
		const contact =
			world.terrain.isSolid(cursor.current.x, cursor.current.y) ||
			world.terrain.collideCircle(cursor.current.x, cursor.current.y, 6);
		(probe.current.material as MeshBasicMaterial).color.set(contact ? '#f4c168' : '#b4e4ba');
	});
	return (
		<>
			<mesh
				position={[0, 0, 20]}
				onPointerMove={(event) => {
					cursor.current = { x: event.point.x, y: event.point.y, visible: true, dirty: true };
				}}
				onPointerOut={() => {
					cursor.current.visible = false;
				}}
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					event.stopPropagation();
					world.terrain.destroyCircle(event.point.x, event.point.y, CRATER_RADIUS);
				}}
			>
				<planeGeometry args={[world.width, world.height]} />
				<meshBasicMaterial transparent opacity={0} depthWrite={false} />
			</mesh>
			<mesh ref={probe} visible={false}>
				<ringGeometry args={[CRATER_RADIUS - 0.8, CRATER_RADIUS, 64]} />
				<meshBasicMaterial transparent opacity={0.6} depthTest={false} />
			</mesh>
		</>
	);
}

export function WorldScene({
	world,
	statusRef,
	onReady,
}: {
	world: GameWorld;
	statusRef: RefObject<HTMLOutputElement | null>;
	onReady: () => void;
}) {
	const waterHeight = world.height / 2 + world.waterLevel;
	const layout = worldLayout(world);
	return (
		<>
			<Gameplay
				key={`${world.seed}:${world.width}:${world.height}`}
				world={world}
				statusRef={statusRef}
				onReady={onReady}
			/>
			<Background
				size={[world.width, layout.cloudTop * 2]}
				position={[0, 0, -2]}
				shader={{ uBottomColor: sceneColors.bgBottomColor, uTopColor: sceneColors.bgTopColor }}
			/>
			<Air maxCloudsPerType={5} height={layout.cloudTop} width={world.width} />
			<WindParticles world={world} />
			<Terrain terrain={world.terrain} />
			<Water
				wind={world.wind}
				width={world.width}
				height={waterHeight}
				position={[0, -world.height / 2 + waterHeight / 2, 5]}
				color={sceneColors.waterColor}
				waveCount={3}
				waveConfig={{
					thickness: 10,
					overlapFactor: 0.4,
					shaderConfig: {
						uAmplitude: 6,
						uColorFrom: sceneColors.waveColorFrom,
						uColorTo: sceneColors.waveColorTo,
					},
				}}
				bubbleConfig={{ color: sceneColors.bubbleColor }}
			/>
			<DebugDestruction world={world} />
		</>
	);
}
