import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BufferAttribute, Mesh, MeshBasicMaterial, Points, Vector3 } from 'three';
import { Air } from '@widgets/Air';
import { Water } from '@widgets/Water';
import { cloudBandGap } from '@widgets/Air/constants';
import { Background } from '@entities/Background';
import { Terrain } from '@entities/Terrain/ui/Terrain';
import { seededRandom } from '@entities/Terrain/model/terrain';
import { clampCameraX, CRATER_RADIUS, GameWorld } from '@entities/World/model/world';
import { sceneColors } from '../constants';

/** Temporary controls isolated from the terrain domain. */
function DebugCamera({ world }: { world: GameWorld }) {
	const { camera, size } = useThree();
	const keys = useRef(new Set<string>());
	useEffect(() => {
		camera.position.x = 0;
		const down = (event: KeyboardEvent) => keys.current.add(event.code);
		const up = (event: KeyboardEvent) => keys.current.delete(event.code);
		const clear = () => keys.current.clear();
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('blur', clear);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('blur', clear);
			clear();
		};
	}, [camera, world]);
	useFrame((_, delta) => {
		const direction = Number(keys.current.has('KeyD')) - Number(keys.current.has('KeyA'));
		camera.position.x = clampCameraX(
			camera.position.x + direction * Math.min(delta, 0.05) * size.width * 0.65,
			world.width,
			size.width
		);
		camera.updateMatrixWorld();
	});
	return null;
}

function WindParticles({ world }: { world: GameWorld }) {
	const ref = useRef<Points>(null);
	const particles = useMemo(() => {
		const random = seededRandom(world.seed ^ 0xd057);
		const count = Math.max(30, Math.ceil(world.width / 24));
		const positions = new Float32Array(count * 3);
		const speeds = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			positions[i * 3] = (random() - 0.5) * world.width;
			positions[i * 3 + 1] = world.waterLevel + random() * (world.height / 2 - world.waterLevel);
			positions[i * 3 + 2] = 2;
			speeds[i] = 0.65 + random() * 0.7;
		}
		return { positions, speeds };
	}, [world]);
	useFrame(({ clock }, delta) => {
		const { positions, speeds } = particles;
		const dt = Math.min(delta, 0.05);
		for (let i = 0; i < speeds.length; i++) {
			positions[i * 3] += world.wind * 95 * speeds[i] * dt;
			positions[i * 3 + 1] += Math.sin(clock.elapsedTime * speeds[i] + i) * 5 * dt;
			if (positions[i * 3] > world.width / 2) positions[i * 3] -= world.width;
			if (positions[i * 3] < -world.width / 2) positions[i * 3] += world.width;
			if (positions[i * 3 + 1] > world.height / 2) positions[i * 3 + 1] = world.waterLevel;
			if (positions[i * 3 + 1] < world.waterLevel) positions[i * 3 + 1] = world.height / 2;
		}
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
		probe.current.visible = cursor.current.visible;
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

export function WorldScene({ world }: { world: GameWorld }) {
	const waterHeight = world.height / 2 + world.waterLevel;
	return (
		<>
			<DebugCamera world={world} />
			<Background
				size={[world.width, world.height]}
				position={[0, 0, -2]}
				shader={{ uBottomColor: sceneColors.bgBottomColor, uTopColor: sceneColors.bgTopColor }}
			/>
			<Air maxCloudsPerType={9} height={world.height / 2 - cloudBandGap} width={world.width} />
			<WindParticles world={world} />
			<Terrain terrain={world.terrain} />
			<Water
				width={world.width}
				height={waterHeight}
				position={[0, -world.height / 2 + waterHeight / 2, 5]}
				color={sceneColors.waterColor}
				waveCount={5}
				waveConfig={{
					overlapFactor: 0.2,
					shaderConfig: {
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
