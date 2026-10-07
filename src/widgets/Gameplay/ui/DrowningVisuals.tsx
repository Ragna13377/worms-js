import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import type { Game } from '../model/simulation';
import { createWormBubbles, updateWormBubbles, WORM_BUBBLE_LIMIT } from '../model/wormBubbles';

export function DrowningVisuals({ game, waterLevel }: { game: Game; waterLevel: number }) {
	const ref = useRef<Group>(null),
		bubbles = useRef(createWormBubbles());
	useFrame(({ camera, viewport }) => {
		updateWormBubbles(
			bubbles.current,
			game.worms,
			game.time,
			waterLevel,
			camera.position.y - viewport.getCurrentViewport(camera).height / 2
		);
		if (!ref.current) return;
		for (const [i, child] of ref.current.children.entries()) {
			const mesh = child as Mesh,
				bubble = bubbles.current.points[i];
			mesh.visible = Boolean(bubble);
			if (!bubble) continue;
			const age = game.time - bubble.born;
			mesh.position.set(bubble.x + Math.sin(age * 7 + i) * 1.5, bubble.y + age * 45, 11);
			mesh.scale.setScalar(0.65 + (i % 3) * 0.15);
			(mesh.material as MeshBasicMaterial).opacity = 0.8 * Math.min(1, (1.6 - age) / 0.3);
		}
	});
	return (
		<group ref={ref}>
			{Array.from({ length: WORM_BUBBLE_LIMIT }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: Fixed particle pool.
				<mesh key={i} visible={false}>
					<ringGeometry args={[1.3, 2.1, 12]} />
					<meshBasicMaterial color='#b4bee9' transparent depthWrite={false} toneMapped={false} />
				</mesh>
			))}
		</group>
	);
}
