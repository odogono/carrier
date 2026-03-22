import { Suspense, useEffect, useMemo, useState } from 'react';

import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useQuery } from '@tanstack/react-query';
import {
  type AssetVersion,
  decodeMapChunkBinary,
  type MapMetadata
} from 'carrier-contracts/types';
import {
  buildTerrainGeometry,
  computeGroundingResult,
  createNormalizedPreviewModel,
  createSyntheticTerrainGrid,
  getChunkCenterAnchor,
  getGroundingSamplePoints,
  terrainGridFromRuntimeChunk
} from 'carrier-preview';
import {
  BufferAttribute,
  BufferGeometry,
  MeshStandardMaterial
} from 'three';

import { client } from '@/lib/api-client';

import { Badge } from '../ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select } from '../ui/select';

type PreviewMode = 'synthetic' | 'real-map';

type AssetPreviewPanelProps = {
  asset: AssetVersion;
  availableMaps: MapMetadata[];
  footprintDepthMeters: number;
  footprintWidthMeters: number;
  maxHeightDeltaMeters: number;
  runtimeHref: string | null;
};

type SceneProps = {
  anchorX: number;
  anchorZ: number;
  footprintDepthMeters: number;
  footprintWidthMeters: number;
  groundedHeight: number;
  runtimeHref: string;
  samplePoints: Array<{
    height: number;
    label: string;
    x: number;
    z: number;
  }>;
  terrainGeometry: BufferGeometry;
  yawDegrees: number;
};

function ModelPreview({
  groundedHeight,
  runtimeHref
}: {
  groundedHeight: number;
  runtimeHref: string;
}) {
  const gltf = useGLTF(runtimeHref);
  const normalized = useMemo(
    () => createNormalizedPreviewModel(gltf.scene),
    [gltf.scene]
  );

  return (
    <primitive
      object={normalized.object}
      position={[0, groundedHeight, 0]}
      scale={[1, 1, 1]}
    />
  );
}

function FootprintOverlay({
  depthMeters,
  groundedHeight,
  samplePoints,
  widthMeters,
  yawDegrees
}: {
  depthMeters: number;
  groundedHeight: number;
  samplePoints: SceneProps['samplePoints'];
  widthMeters: number;
  yawDegrees: number;
}) {
  const lineGeometry = useMemo(() => {
    const samplePointsBase = getGroundingSamplePoints({
      anchorX: 0,
      anchorZ: 0,
      depthMeters,
      widthMeters,
      yawDegrees
    });
    const frontLeft = samplePointsBase.find(point => point.label === 'front-left');
    const frontRight = samplePointsBase.find(
      point => point.label === 'front-right'
    );
    const backLeft = samplePointsBase.find(point => point.label === 'back-left');
    const backRight = samplePointsBase.find(point => point.label === 'back-right');

    if (!frontLeft || !frontRight || !backLeft || !backRight) {
      return null;
    }

    const positions = new Float32Array([
      frontLeft.x,
      groundedHeight + 0.05,
      frontLeft.z,
      frontRight.x,
      groundedHeight + 0.05,
      frontRight.z,
      frontRight.x,
      groundedHeight + 0.05,
      frontRight.z,
      backRight.x,
      groundedHeight + 0.05,
      backRight.z,
      backRight.x,
      groundedHeight + 0.05,
      backRight.z,
      backLeft.x,
      groundedHeight + 0.05,
      backLeft.z,
      backLeft.x,
      groundedHeight + 0.05,
      backLeft.z,
      frontLeft.x,
      groundedHeight + 0.05,
      frontLeft.z
    ]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    return geometry;
  }, [depthMeters, groundedHeight, widthMeters, yawDegrees]);

  useEffect(() => {
    return () => {
      lineGeometry?.dispose();
    };
  }, [lineGeometry]);

  if (!lineGeometry) {
    return null;
  }

  return (
    <group>
      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial color="#f97316" linewidth={2} />
      </lineSegments>
      {samplePoints.map(sample => (
        <group key={sample.label} position={[sample.x, sample.height, sample.z]}>
          <mesh position={[0, 0.4, 0]}>
            <sphereGeometry args={[0.45, 16, 16]} />
            <meshStandardMaterial
              color={sample.label === 'center' ? '#ffffff' : '#38bdf8'}
              emissive={sample.label === 'center' ? '#ffffff' : '#0ea5e9'}
              emissiveIntensity={0.3}
            />
          </mesh>
          <lineSegments>
            <bufferGeometry>
              <bufferAttribute
                args={[
                  new Float32Array([0, 0, 0, 0, groundedHeight - sample.height, 0]),
                  3
                ]}
                attach="attributes-position"
              />
            </bufferGeometry>
            <lineBasicMaterial color="#38bdf8" />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

function PreviewScene({
  anchorX,
  anchorZ,
  footprintDepthMeters,
  footprintWidthMeters,
  groundedHeight,
  runtimeHref,
  samplePoints,
  terrainGeometry,
  yawDegrees
}: SceneProps) {
  const terrainMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        roughness: 0.95,
        metalness: 0.05,
        vertexColors: true
      }),
    []
  );

  useEffect(() => {
    return () => {
      terrainMaterial.dispose();
    };
  }, [terrainMaterial]);

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight
        castShadow
        intensity={1.1}
        position={[18, 30, 12]}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <group rotation={[0, (yawDegrees * Math.PI) / 180, 0]}>
        <Suspense fallback={null}>
          <ModelPreview groundedHeight={groundedHeight} runtimeHref={runtimeHref} />
        </Suspense>
      </group>
      <mesh geometry={terrainGeometry} material={terrainMaterial} receiveShadow />
      <FootprintOverlay
        depthMeters={footprintDepthMeters}
        groundedHeight={groundedHeight}
        samplePoints={samplePoints.map(sample => ({
          ...sample,
          x: sample.x - anchorX,
          z: sample.z - anchorZ
        }))}
        widthMeters={footprintWidthMeters}
        yawDegrees={yawDegrees}
      />
      <gridHelper args={[120, 24, '#334155', '#1e293b']} position={[0, -0.01, 0]} />
      <OrbitControls makeDefault maxPolarAngle={Math.PI * 0.48} minDistance={12} />
    </>
  );
}

export function AssetPreviewPanel({
  asset,
  availableMaps,
  footprintDepthMeters,
  footprintWidthMeters,
  maxHeightDeltaMeters,
  runtimeHref
}: AssetPreviewPanelProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('synthetic');
  const [selectedMapId, setSelectedMapId] = useState<string>(
    availableMaps[0]?.id ?? ''
  );
  const [chunkX, setChunkX] = useState('0');
  const [chunkZ, setChunkZ] = useState('0');
  const [yawDegrees, setYawDegrees] = useState('35');

  useEffect(() => {
    if (!selectedMapId && availableMaps[0]) {
      setSelectedMapId(availableMaps[0].id);
    }
  }, [availableMaps, selectedMapId]);

  const selectedMap =
    availableMaps.find(map => map.id === selectedMapId) ?? availableMaps[0] ?? null;
  const parsedChunkX = Number(chunkX);
  const parsedChunkZ = Number(chunkZ);
  const parsedYawDegrees = Number(yawDegrees);

  const realChunkQuery = useQuery({
    enabled:
      previewMode === 'real-map' &&
      selectedMap !== null &&
      Number.isInteger(parsedChunkX) &&
      Number.isInteger(parsedChunkZ),
    queryFn: async () =>
      decodeMapChunkBinary(
        await client.maps.getChunkBinary({
          chunkX: parsedChunkX,
          chunkZ: parsedChunkZ,
          mapId: selectedMap!.id
        })
      ),
    queryKey: ['asset-preview', asset.id, selectedMap?.id, parsedChunkX, parsedChunkZ]
  });

  const terrain = useMemo(() => {
    if (previewMode === 'synthetic') {
      return createSyntheticTerrainGrid({
        depthMeters: footprintDepthMeters,
        widthMeters: footprintWidthMeters
      });
    }

    if (!selectedMap || !realChunkQuery.data) {
      return null;
    }

    return terrainGridFromRuntimeChunk(
      realChunkQuery.data,
      selectedMap.resolution.metersPerTile
    );
  }, [
    footprintDepthMeters,
    footprintWidthMeters,
    previewMode,
    realChunkQuery.data,
    selectedMap
  ]);

  const anchor = useMemo(() => {
    if (previewMode === 'synthetic' || !selectedMap || !realChunkQuery.data) {
      return { x: 0, z: 0 };
    }

    return getChunkCenterAnchor(
      realChunkQuery.data,
      selectedMap.resolution.metersPerTile
    );
  }, [previewMode, realChunkQuery.data, selectedMap]);

  const grounding = useMemo(() => {
    if (!terrain || !Number.isFinite(parsedYawDegrees)) {
      return null;
    }

    return computeGroundingResult({
      anchorX: anchor.x,
      anchorZ: anchor.z,
      depthMeters: footprintDepthMeters,
      maxHeightDeltaMeters,
      terrain,
      widthMeters: footprintWidthMeters,
      yawDegrees: parsedYawDegrees
    });
  }, [
    anchor.x,
    anchor.z,
    footprintDepthMeters,
    footprintWidthMeters,
    maxHeightDeltaMeters,
    parsedYawDegrees,
    terrain
  ]);

  const terrainGeometry = useMemo(() => {
    if (!terrain) {
      return null;
    }

    return buildTerrainGeometry({
      terrain,
      translateX: anchor.x,
      translateZ: anchor.z
    });
  }, [anchor.x, anchor.z, terrain]);

  useEffect(() => {
    return () => {
      terrainGeometry?.dispose();
    };
  }, [terrainGeometry]);

  const ready =
    runtimeHref !== null &&
    terrainGeometry !== null &&
    grounding !== null &&
    Number.isFinite(parsedYawDegrees);

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-lg">3D Preview</CardTitle>
        <CardDescription>
          Inspect the runtime GLB against synthetic terrain or a real map chunk.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor={`${asset.id}-preview-mode`}>Preview mode</Label>
            <Select
              id={`${asset.id}-preview-mode`}
              onChange={event =>
                setPreviewMode(event.target.value as PreviewMode)
              }
              value={previewMode}
            >
              <option value="synthetic">synthetic</option>
              <option value="real-map">real map</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${asset.id}-preview-yaw`}>Yaw (degrees)</Label>
            <Input
              id={`${asset.id}-preview-yaw`}
              onChange={event => setYawDegrees(event.target.value)}
              value={yawDegrees}
            />
          </div>
          {previewMode === 'real-map' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor={`${asset.id}-preview-map`}>Map</Label>
                <Select
                  id={`${asset.id}-preview-map`}
                  onChange={event => setSelectedMapId(event.target.value)}
                  value={selectedMapId}
                >
                  {availableMaps.map(map => (
                    <option key={map.id} value={map.id}>
                      {map.name ?? map.id}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor={`${asset.id}-preview-chunk-x`}>Chunk X</Label>
                  <Input
                    id={`${asset.id}-preview-chunk-x`}
                    onChange={event => setChunkX(event.target.value)}
                    value={chunkX}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${asset.id}-preview-chunk-z`}>Chunk Z</Label>
                  <Input
                    id={`${asset.id}-preview-chunk-z`}
                    onChange={event => setChunkZ(event.target.value)}
                    value={chunkZ}
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border bg-slate-950">
          {ready ? (
            <div className="h-[440px] w-full">
              <Canvas camera={{ far: 400, fov: 45, near: 0.1, position: [28, 22, 28] }} shadows>
                <PreviewScene
                  anchorX={anchor.x}
                  anchorZ={anchor.z}
                  footprintDepthMeters={footprintDepthMeters}
                  footprintWidthMeters={footprintWidthMeters}
                  groundedHeight={grounding.averageHeight}
                  runtimeHref={runtimeHref}
                  samplePoints={grounding.samples}
                  terrainGeometry={terrainGeometry}
                  yawDegrees={parsedYawDegrees}
                />
              </Canvas>
            </div>
          ) : (
            <div className="flex h-[440px] items-center justify-center px-6 text-center text-sm text-slate-300">
              {runtimeHref === null
                ? 'Runtime artifact not available yet. Finish processing before previewing.'
                : previewMode === 'real-map' && realChunkQuery.isLoading
                  ? 'Loading chunk terrain...'
                  : previewMode === 'real-map' && realChunkQuery.error
                    ? 'Failed to load the selected chunk.'
                    : 'Preview data is incomplete for the current inputs.'}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Grounded height
            </div>
            <div className="mt-1 text-lg font-semibold">
              {grounding ? grounding.averageHeight.toFixed(2) : '—'}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Max height delta
            </div>
            <div className="mt-1 text-lg font-semibold">
              {grounding ? grounding.maxHeightDelta.toFixed(2) : '—'}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Threshold
            </div>
            <div className="mt-1 text-lg font-semibold">
              {maxHeightDeltaMeters.toFixed(2)}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Validity
            </div>
            <div className="mt-2">
              {grounding ? (
                <Badge variant={grounding.valid ? 'default' : 'destructive'}>
                  {grounding.valid ? 'valid' : 'warning'}
                </Badge>
              ) : (
                <Badge variant="outline">unavailable</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-md border p-4">
          <div className="mb-3 text-sm font-medium">Grounding samples</div>
          {grounding ? (
            <div className="grid gap-2 md:grid-cols-5">
              {grounding.samples.map(sample => (
                <div className="rounded-md bg-muted/40 p-3" key={sample.label}>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {sample.label}
                  </div>
                  <div className="mt-1 font-medium">{sample.height.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">
                    {sample.x.toFixed(1)}, {sample.z.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Grounding diagnostics unavailable for the current preview inputs.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
