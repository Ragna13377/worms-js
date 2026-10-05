import { useEffect, useMemo } from 'react';
import { TerrainModel } from '../model/terrain';
import { createTerrainTiles } from './terrainTiles';

export function Terrain({ terrain }: { terrain: TerrainModel }) {
	const rendering = useMemo(() => createTerrainTiles(terrain), [terrain]);
	useEffect(() => {
		const unsubscribe = terrain.subscribe(rendering.update);
		return () => {
			unsubscribe();
			rendering.dispose();
		};
	}, [terrain, rendering]);
	return (
		<group position={[terrain.left, terrain.bottom, 3]}>
			{rendering.tiles.map((tile) => (
				<mesh
					key={`${tile.x}:${tile.y}`}
					position={[tile.x + tile.width / 2, tile.y + tile.height / 2, 0]}
				>
					<planeGeometry args={[tile.width, tile.height]} />
					<meshBasicMaterial map={tile.texture} transparent alphaTest={0.5} toneMapped={false} />
				</mesh>
			))}
		</group>
	);
}
