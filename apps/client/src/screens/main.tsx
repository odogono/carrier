import { useRef } from 'react';

import { Mesh, PCFShadowMap } from 'three';
import { Box, OrbitControls, Plane, Text3D } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';

import { createLog } from 'odgn-ts-helpers/log';

import { ThemeTogglePortal } from '@/components/theme/toggle-portal';
import { useTheme } from '@/contexts/theme/context';

const log = createLog('Main');

const Scene = () => {
  const textRef = useRef<Mesh>(null);
  const { theme } = useTheme();

  // Define colors based on theme
  const textColor = theme === 'light' ? '#999' : '#DDD';
  const planeColor = theme === 'light' ? '#F5F5F5' : '#606060';

  return (
    <>
      <Text3D
        bevelEnabled
        bevelOffset={0}
        bevelSegments={5}
        bevelSize={0.02}
        bevelThickness={0.02}
        castShadow
        curveSegments={12}
        font="https://threejs.org/examples/fonts/helvetiker_regular.typeface.json"
        height={0.2}
        position={[-2, 0.5, 5]}
        ref={textRef}
        rotation={[0, Math.PI / 3, 0]}
        size={1}
      >
        ODGN R3F Starter
        <meshStandardMaterial color={textColor} />
      </Text3D>

      <Box args={[1, 1, 1]} castShadow position={[-2, 0.5, 0]}>
        <meshStandardMaterial color="red" />
      </Box>

      <Box args={[1, 1, 1]} castShadow position={[2, 0.5, 0]}>
        <meshStandardMaterial color="green" />
      </Box>

      <Box args={[1, 1, 1]} castShadow position={[2, 0.5, 4]}>
        <meshStandardMaterial color="blue" />
      </Box>

      {/* Ground plane */}
      <Plane
        args={[10, 10]}
        position={[0, 0, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color={planeColor} />
      </Plane>

      <ambientLight intensity={0.5} />
      <directionalLight castShadow intensity={1} position={[10, 10, 5]} />

      <OrbitControls
        dampingFactor={0.05}
        enableDamping={true}
        maxDistance={20}
        minDistance={5}
      />
    </>
  );
};

export const Main = () => {
  log.info('ODGN R3F Starter');

  return (
    <>
      <div className="bg-background h-screen w-screen">
        <div className="flex h-full w-full items-center justify-center gap-4">
          <Canvas
            camera={{ fov: 50, position: [15, 15, 15] }}
            shadows={{ type: PCFShadowMap }}
            style={{ background: 'transparent' }}
          >
            <Scene />
          </Canvas>
        </div>
      </div>
      <ThemeTogglePortal />
    </>
  );
};
