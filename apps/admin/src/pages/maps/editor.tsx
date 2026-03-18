import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";

import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Home, Minus, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  isInfiniteMap,
  type BooleanOperation,
  type ControlPoint,
  type DerivedIsland,
  type SourcePolygon,
  type SourcePolygonParams,
  type WorldBounds,
  type WorldPoint,
} from "carrier-contracts/types";

import { MapStage } from "@/components/map-viewer/map-stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useMapChunks } from "@/hooks/use-map-chunks";
import { useMapEditorData } from "@/hooks/use-map-editor-data";
import {
  getViewportWorldBounds,
  getVisibleChunkRange,
  screenToTilePoint,
  tileToScreenPoint,
  tileToWorldPoint,
  useMapViewport,
  worldToTilePoint,
} from "@/hooks/use-map-viewport";
import { client } from "@/lib/api-client";
import {
  DEFAULT_CONTROL_POINT,
  DEFAULT_SOURCE_POLYGON_PARAMS,
  canDeleteVertex,
  canSavePolygonDraft,
  getPolygonEdgeInsertPosition,
  mergeWorldBounds,
  nextOrderedSelection,
  type EditorTool,
} from "./editor-utils";

type PolygonDraft = {
  id?: string;
  kind: "create" | "edit";
  params: SourcePolygonParams;
  selectedVertexIndex: number | null;
  vertices: WorldPoint[];
};

type ControlPointDraft = {
  elevationMeters: number;
  id?: string;
  influenceMeters: number;
  kind: "create" | "edit";
  strength: number;
  type: ControlPoint["type"];
  x: number;
  z: number;
};

type IslandDraft = {
  defaultFaction: string;
  defaultOwner: string;
  id: string;
  name: string;
};

type DeleteTarget =
  | { id: string; kind: "control-point" }
  | { id: string; kind: "polygon" }
  | null;

type CanvasDragState =
  | { kind: "control-point"; pointId?: string; pointerId: number }
  | { kind: "vertex"; pointerId: number; vertexIndex: number }
  | null;

const STOP_PROPAGATION = (event: { stopPropagation(): void }) => {
  event.stopPropagation();
};

const getErrorCode = (error: unknown): string | null => {
  if (typeof error !== "object" || !error) {
    return null;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if (
    "data" in error &&
    typeof error.data === "object" &&
    error.data &&
    "code" in error.data &&
    typeof error.data.code === "string"
  ) {
    return error.data.code;
  }

  return null;
};

const toMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const createPolygonDraft = (
  polygon?: Pick<SourcePolygon, "id" | "params" | "vertices">,
): PolygonDraft => ({
  id: polygon?.id,
  kind: polygon ? "edit" : "create",
  params: polygon?.params ?? { ...DEFAULT_SOURCE_POLYGON_PARAMS },
  selectedVertexIndex: null,
  vertices: polygon?.vertices.map((vertex) => ({ ...vertex })) ?? [],
});

const createControlPointDraft = (
  point?: Pick<
    ControlPoint,
    | "elevationMeters"
    | "id"
    | "influenceMeters"
    | "strength"
    | "type"
    | "x"
    | "z"
  >,
): ControlPointDraft => ({
  elevationMeters: point?.elevationMeters ?? DEFAULT_CONTROL_POINT.elevationMeters,
  id: point?.id,
  influenceMeters: point?.influenceMeters ?? DEFAULT_CONTROL_POINT.influenceMeters,
  kind: point ? "edit" : "create",
  strength: point?.strength ?? DEFAULT_CONTROL_POINT.strength,
  type: point?.type ?? DEFAULT_CONTROL_POINT.type,
  x: point?.x ?? 0,
  z: point?.z ?? 0,
});

const createIslandDraft = (
  island: Pick<DerivedIsland, "defaultFaction" | "defaultOwner" | "id" | "name">,
): IslandDraft => ({
  defaultFaction: island.defaultFaction ?? "",
  defaultOwner: island.defaultOwner ?? "",
  id: island.id,
  name: island.name ?? "",
});

const getBoundsCenter = (bounds: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ">) => ({
  x: (bounds.minX + bounds.maxX) / 2,
  z: (bounds.minZ + bounds.maxZ) / 2,
});

const expandBounds = (
  bounds: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ">,
  amount: number,
): WorldBounds => ({
  maxX: bounds.maxX + amount,
  maxZ: bounds.maxZ + amount,
  minX: bounds.minX - amount,
  minZ: bounds.minZ - amount,
});

const boundsFromPolygons = (polygons: readonly Pick<SourcePolygon, "bbox">[]) =>
  polygons.reduce<WorldBounds | null>(
    (bounds, polygon) => mergeWorldBounds(bounds, polygon.bbox),
    null,
  );

const parseNumber = (value: string, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const isDraftDirty = (
  draft: PolygonDraft,
  polygon: Pick<SourcePolygon, "params" | "vertices"> | null,
) => {
  if (!polygon) {
    return draft.vertices.length > 0;
  }

  return JSON.stringify(draft.vertices) !== JSON.stringify(polygon.vertices) ||
    JSON.stringify(draft.params) !== JSON.stringify(polygon.params);
};

export function MapEditorPage() {
  const { id } = useParams({ from: "/maps/$id/editor" });
  const navigate = useNavigate();
  const interactionRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialFitRef = useRef(false);
  const [size, setSize] = useState({ height: 0, width: 0 });
  const [tool, setTool] = useState<EditorTool>("select");
  const [editorRevision, setEditorRevision] = useState<number | null>(null);
  const [selectedPolygonIds, setSelectedPolygonIds] = useState<string[]>([]);
  const [selectedControlPointId, setSelectedControlPointId] = useState<string | null>(null);
  const [selectedIslandId, setSelectedIslandId] = useState<string | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<PolygonDraft | null>(null);
  const [controlPointDraft, setControlPointDraft] = useState<ControlPointDraft | null>(null);
  const [islandDraft, setIslandDraft] = useState<IslandDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [dragState, setDragState] = useState<CanvasDragState>(null);

  const {
    controlPointsQuery,
    derivedIslandsQuery,
    invalidateIslandMetadataQueries,
    invalidateTerrainMutation,
    map,
    mapQuery,
    overviewQuery,
    polygonsQuery,
    reloadAll,
  } = useMapEditorData(id);

  const polygons = polygonsQuery.data ?? [];
  const controlPoints = controlPointsQuery.data ?? [];
  const derivedIslands = derivedIslandsQuery.data ?? [];
  const selectedPolygon =
    selectedPolygonIds.length === 1
      ? polygons.find((polygon) => polygon.id === selectedPolygonIds[0]) ?? null
      : null;
  const selectedControlPoint = selectedControlPointId
    ? controlPoints.find((point) => point.id === selectedControlPointId) ?? null
    : null;
  const selectedIsland = selectedIslandId
    ? derivedIslands.find((island) => island.id === selectedIslandId) ?? null
    : null;
  const highlightedIslandPolygonIds = useMemo(
    () => new Set(selectedIsland?.sourcePolygonIds ?? []),
    [selectedIsland],
  );

  useEffect(() => {
    if (map && editorRevision === null) {
      setEditorRevision(map.revision);
    }
  }, [editorRevision, map]);

  useEffect(() => {
    if (!map || isInfiniteMap(map)) {
      return;
    }

    toast.error("Only infinite-vector maps can open the editor");
    void navigate({ to: "/maps/$id", params: { id } });
  }, [id, map, navigate]);

  const measureContainer = useCallback(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    setSize((previous) => {
      const next = {
        height: Math.floor(rect.height),
        width: Math.floor(rect.width),
      };

      if (previous.height === next.height && previous.width === next.width) {
        return previous;
      }

      return next;
    });
  }, []);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    measureContainer();

    const observer = new ResizeObserver(measureContainer);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [measureContainer]);

  const {
    fitToView,
    fitToWorldBounds,
    onKeyDown: onViewportKeyDown,
    onPointerCancel: onViewportPointerCancel,
    onPointerDown: onViewportPointerDown,
    onPointerLeave: onViewportPointerLeave,
    onPointerMove: onViewportPointerMove,
    onPointerUp: onViewportPointerUp,
    onWheel,
    recenterOnWorldPoint,
    viewport,
    zoomIn,
    zoomOut,
  } = useMapViewport(
    map ?? {
      createdAt: "",
      extent: { kind: "infinite" },
      id,
      kind: "infinite-vector",
      name: null,
      resolution: { chunkSizeTiles: 32, metersPerTile: 10 },
      revision: 0,
      seed: "",
      updatedAt: "",
    },
    size.width,
    size.height,
  );

  useEffect(() => {
    if (!map || !isInfiniteMap(map) || size.width <= 0 || size.height <= 0 || initialFitRef.current) {
      return;
    }

    initialFitRef.current = true;

    if (overviewQuery.data?.bounds) {
      fitToWorldBounds(overviewQuery.data.bounds);
      return;
    }

    fitToView();
  }, [fitToView, fitToWorldBounds, map, overviewQuery.data?.bounds, size.height, size.width]);

  const chunkRange = map
    ? getVisibleChunkRange(viewport, size.width, size.height, map)
    : null;
  const chunks = useMapChunks(id, chunkRange ?? {
    maxChunkX: 0,
    maxChunkZ: 0,
    minChunkX: 0,
    minChunkZ: 0,
  }, Boolean(map));

  const viewportWorldBounds = map
    ? getViewportWorldBounds(map, viewport, size.width, size.height)
    : null;
  const overviewBounds = useMemo(() => {
    if (!viewportWorldBounds) {
      return null;
    }

    const combined = mergeWorldBounds(overviewQuery.data?.bounds ?? null, viewportWorldBounds);
    if (!combined || !map) {
      return combined;
    }

    const chunkWorldSize = map.resolution.chunkSizeTiles * map.resolution.metersPerTile;
    return expandBounds(combined, chunkWorldSize * 0.5);
  }, [map, overviewQuery.data?.bounds, viewportWorldBounds]);

  const toScreenPoint = useCallback(
    (point: Pick<WorldPoint, "x" | "z">) => {
      if (!map) {
        return { x: 0, z: 0 };
      }

      const tilePoint = worldToTilePoint(map, point);
      return tileToScreenPoint(
        viewport,
        size.width,
        size.height,
        tilePoint.x,
        tilePoint.z,
      );
    },
    [map, size.height, size.width, viewport],
  );

  const toWorldPoint = useCallback(
    (event: {
      clientX: number;
      clientY: number;
      currentTarget: { getBoundingClientRect(): DOMRect };
    }) => {
      if (!map) {
        return { x: 0, z: 0 };
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const tilePoint = screenToTilePoint(
        viewport,
        size.width,
        size.height,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );

      return tileToWorldPoint(map, tilePoint);
    },
    [map, size.height, size.width, viewport],
  );

  const clearSelections = useCallback(() => {
    setSelectedPolygonIds([]);
    setSelectedControlPointId(null);
    setSelectedIslandId(null);
  }, []);

  const syncRevisionFromServer = useCallback(async () => {
    const freshMap = await reloadAll();
    setEditorRevision(freshMap?.revision ?? null);
  }, [reloadAll]);

  const handleConflict = useCallback(
    async (reset: () => void) => {
      reset();
      await syncRevisionFromServer();
      toast.error("The editor was out of date. Reloaded latest map data.");
    },
    [syncRevisionFromServer],
  );

  const runAction = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (pendingAction) {
        return;
      }

      setPendingAction(label);

      try {
        await action();
      } finally {
        setPendingAction(null);
      }
    },
    [pendingAction],
  );

  const beginVertexEdit = useCallback(() => {
    if (!selectedPolygon) {
      return;
    }

    setPolygonDraft(createPolygonDraft(selectedPolygon));
    setControlPointDraft(null);
    setTool("edit-vertices");
  }, [selectedPolygon]);

  const resetPolygonDraft = useCallback(() => {
    setPolygonDraft(null);
    setTool("select");
  }, []);

  const resetControlPointDraft = useCallback(() => {
    setControlPointDraft(null);
    setTool("select");
  }, []);

  const savePolygonDraft = useCallback(async () => {
    if (!polygonDraft || !map || editorRevision === null || !canSavePolygonDraft(polygonDraft.vertices, polygonDraft.params)) {
      return;
    }

    await runAction(
      polygonDraft.kind === "create" ? "create-polygon" : "save-polygon",
      async () => {
        try {
          const result = polygonDraft.kind === "create"
            ? await client.maps.createSourcePolygon({
                expectedRevision: editorRevision,
                mapId: id,
                params: polygonDraft.params,
                vertices: polygonDraft.vertices,
              })
            : await client.maps.updateSourcePolygon({
                expectedRevision: editorRevision,
                id: polygonDraft.id ?? "",
                mapId: id,
                params: polygonDraft.params,
                vertices: polygonDraft.vertices,
              });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setPolygonDraft(null);
          setTool("select");
          setSelectedPolygonIds([result.polygon.id]);
          setSelectedControlPointId(null);
          setSelectedIslandId(null);
          toast.success(
            polygonDraft.kind === "create" ? "Polygon created" : "Polygon saved",
          );
        } catch (error) {
          if (getErrorCode(error) === "CONFLICT") {
            await handleConflict(() => {
              setPolygonDraft(null);
            });
            return;
          }

          toast.error(toMessage(error, "Failed to save polygon"));
        }
      },
    );
  }, [
    editorRevision,
    handleConflict,
    id,
    invalidateTerrainMutation,
    map,
    polygonDraft,
    runAction,
  ]);

  const saveControlPointDraft = useCallback(async () => {
    if (!controlPointDraft || editorRevision === null) {
      return;
    }

    await runAction(
      controlPointDraft.kind === "create" ? "create-control-point" : "save-control-point",
      async () => {
        try {
          const payload = {
            elevationMeters: controlPointDraft.elevationMeters,
            expectedRevision: editorRevision,
            influenceMeters: controlPointDraft.influenceMeters,
            mapId: id,
            strength: controlPointDraft.strength,
            type: controlPointDraft.type,
            x: controlPointDraft.x,
            z: controlPointDraft.z,
          };
          const result = controlPointDraft.kind === "create"
            ? await client.maps.createControlPoint(payload)
            : await client.maps.updateControlPoint({
                ...payload,
                id: controlPointDraft.id ?? "",
              });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setControlPointDraft(null);
          setTool("select");
          setSelectedControlPointId(result.controlPoint.id);
          setSelectedPolygonIds([]);
          setSelectedIslandId(null);
          toast.success(
            controlPointDraft.kind === "create"
              ? "Control point created"
              : "Control point saved",
          );
        } catch (error) {
          if (getErrorCode(error) === "CONFLICT") {
            await handleConflict(() => {
              setControlPointDraft(null);
            });
            return;
          }

          toast.error(toMessage(error, "Failed to save control point"));
        }
      },
    );
  }, [
    controlPointDraft,
    editorRevision,
    handleConflict,
    id,
    invalidateTerrainMutation,
    runAction,
  ]);

  const saveIslandDraft = useCallback(async () => {
    if (!islandDraft || editorRevision === null) {
      return;
    }

    await runAction("save-island", async () => {
      try {
        const result = await client.maps.updateDerivedIsland({
          defaultFaction: islandDraft.defaultFaction.trim() || null,
          defaultOwner: islandDraft.defaultOwner.trim() || null,
          expectedRevision: editorRevision,
          id: islandDraft.id,
          mapId: id,
          name: islandDraft.name.trim() || null,
        });

        setEditorRevision(result.mapRevision);
        await invalidateIslandMetadataQueries();
        setIslandDraft(createIslandDraft(result.island));
        toast.success("Island metadata saved");
      } catch (error) {
        if (getErrorCode(error) === "CONFLICT") {
          await handleConflict(() => {
            setIslandDraft(null);
          });
          return;
        }

        toast.error(toMessage(error, "Failed to save island metadata"));
      }
    });
  }, [
    editorRevision,
    handleConflict,
    id,
    invalidateIslandMetadataQueries,
    islandDraft,
    runAction,
  ]);

  const applyBooleanOperation = useCallback(
    async (operation: BooleanOperation) => {
      if (editorRevision === null || selectedPolygonIds.length === 0 || !map) {
        return;
      }

      await runAction(`boolean-${operation}`, async () => {
        try {
          const result = await client.maps.applyBoolean({
            expectedRevision: editorRevision,
            mapId: id,
            operation,
            polygonIds: selectedPolygonIds,
          });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setSelectedPolygonIds(result.createdPolygons.map((polygon) => polygon.id));
          setSelectedControlPointId(null);
          setSelectedIslandId(null);
          setPolygonDraft(null);
          setTool("select");

          const resultBounds = boundsFromPolygons(result.createdPolygons);
          if (resultBounds) {
            fitToWorldBounds(resultBounds);
          }

          toast.success(`Boolean ${operation} applied`);
        } catch (error) {
          if (getErrorCode(error) === "CONFLICT") {
            await handleConflict(() => {
              setSelectedPolygonIds([]);
            });
            return;
          }

          toast.error(toMessage(error, `Failed to apply ${operation}`));
        }
      });
    },
    [
      editorRevision,
      fitToWorldBounds,
      handleConflict,
      id,
      invalidateTerrainMutation,
      map,
      runAction,
      selectedPolygonIds,
    ],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || editorRevision === null) {
      return;
    }

    await runAction(`delete-${deleteTarget.kind}`, async () => {
      try {
        if (deleteTarget.kind === "polygon") {
          const result = await client.maps.deleteSourcePolygon({
            expectedRevision: editorRevision,
            id: deleteTarget.id,
            mapId: id,
          });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setSelectedPolygonIds([]);
          setPolygonDraft(null);
          setTool("select");
          toast.success("Polygon deleted");
        } else {
          const result = await client.maps.deleteControlPoint({
            expectedRevision: editorRevision,
            id: deleteTarget.id,
            mapId: id,
          });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setSelectedControlPointId(null);
          setControlPointDraft(null);
          setTool("select");
          toast.success("Control point deleted");
        }

        setDeleteTarget(null);
      } catch (error) {
        if (getErrorCode(error) === "CONFLICT") {
          await handleConflict(() => {
            if (deleteTarget.kind === "polygon") {
              setSelectedPolygonIds([]);
            } else {
              setSelectedControlPointId(null);
            }
            setDeleteTarget(null);
          });
          return;
        }

        toast.error(toMessage(error, "Delete failed"));
      }
    });
  }, [
    deleteTarget,
    editorRevision,
    handleConflict,
    id,
    invalidateTerrainMutation,
    runAction,
  ]);

  const handleWheelCapture = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      interactionRef.current?.focus();

      if (dragState) {
        return;
      }

      if (tool === "pan" || tool === "select" || tool === "edit-vertices") {
        onViewportPointerDown(event);
      }
    },
    [dragState, onViewportPointerDown, tool],
  );

  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (dragState?.kind === "vertex" && polygonDraft) {
        const world = toWorldPoint(event);
        setPolygonDraft((draft) => {
          if (!draft) {
            return draft;
          }

          return {
            ...draft,
            selectedVertexIndex: dragState.vertexIndex,
            vertices: draft.vertices.map((vertex, index) =>
              index === dragState.vertexIndex ? world : vertex,
            ),
          };
        });
        return;
      }

      if (dragState?.kind === "control-point") {
        const world = toWorldPoint(event);
        setControlPointDraft((draft) => {
          if (draft) {
            return {
              ...draft,
              x: world.x,
              z: world.z,
            };
          }

          if (!selectedControlPoint || dragState.pointId !== selectedControlPoint.id) {
            return draft;
          }

          return {
            ...createControlPointDraft(selectedControlPoint),
            x: world.x,
            z: world.z,
          };
        });
        return;
      }

      onViewportPointerMove(event);
    },
    [dragState, onViewportPointerMove, polygonDraft, selectedControlPoint, toWorldPoint],
  );

  const releaseCanvasDrag = useCallback(() => {
    setDragState(null);
  }, []);

  const handleCanvasPointerUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      releaseCanvasDrag();
      onViewportPointerUp(event);
    },
    [onViewportPointerUp, releaseCanvasDrag],
  );

  const handleCanvasPointerCancel = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      releaseCanvasDrag();
      onViewportPointerCancel(event);
    },
    [onViewportPointerCancel, releaseCanvasDrag],
  );

  const handleCanvasPointerLeave = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      releaseCanvasDrag();
      onViewportPointerLeave(event);
    },
    [onViewportPointerLeave, releaseCanvasDrag],
  );

  const handleCanvasClick = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!map) {
        return;
      }

      if (tool === "draw-polygon") {
        const world = toWorldPoint(event);
        setPolygonDraft((draft) => {
          const nextDraft = draft ?? createPolygonDraft();
          return {
            ...nextDraft,
            vertices: [...nextDraft.vertices, world],
          };
        });
        return;
      }

      if (tool === "place-control-point") {
        const world = toWorldPoint(event);
        setControlPointDraft({
          ...createControlPointDraft(),
          x: world.x,
          z: world.z,
        });
        setSelectedPolygonIds([]);
        setSelectedControlPointId(null);
        setSelectedIslandId(null);
        return;
      }

      if (tool === "select") {
        clearSelections();
        setPolygonDraft(null);
      }
    },
    [clearSelections, map, toWorldPoint, tool],
  );

  const commitDrawPolygon = useCallback(() => {
    if (polygonDraft && canSavePolygonDraft(polygonDraft.vertices, polygonDraft.params)) {
      void savePolygonDraft();
    }
  }, [polygonDraft, savePolygonDraft]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (polygonDraft) {
          resetPolygonDraft();
          return;
        }

        if (controlPointDraft) {
          resetControlPointDraft();
          return;
        }

        clearSelections();
        return;
      }

      if (event.key === "Enter" && tool === "draw-polygon") {
        event.preventDefault();
        commitDrawPolygon();
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && !pendingAction) {
        if (polygonDraft && canDeleteVertex(polygonDraft.vertices, polygonDraft.selectedVertexIndex)) {
          event.preventDefault();
          setPolygonDraft((draft) => {
            if (!draft || draft.selectedVertexIndex === null) {
              return draft;
            }

            return {
              ...draft,
              selectedVertexIndex: null,
              vertices: draft.vertices.filter(
                (_vertex, index) => index !== draft.selectedVertexIndex,
              ),
            };
          });
          return;
        }

        if (selectedPolygon) {
          event.preventDefault();
          setDeleteTarget({ id: selectedPolygon.id, kind: "polygon" });
          return;
        }

        if (selectedControlPoint) {
          event.preventDefault();
          setDeleteTarget({ id: selectedControlPoint.id, kind: "control-point" });
          return;
        }
      }

      onViewportKeyDown(event);
    },
    [
      clearSelections,
      commitDrawPolygon,
      controlPointDraft,
      onViewportKeyDown,
      pendingAction,
      polygonDraft,
      resetControlPointDraft,
      resetPolygonDraft,
      selectedControlPoint,
      selectedPolygon,
      tool,
    ],
  );

  const zoomPercent = Math.round(viewport.zoom * 100);
  const currentPolygonForInspector =
    polygonDraft ??
    (selectedPolygon ? createPolygonDraft(selectedPolygon) : null);
  const currentControlPointForInspector =
    controlPointDraft ??
    (selectedControlPoint ? createControlPointDraft(selectedControlPoint) : null);
  const islandInspectorDraft =
    islandDraft ?? (selectedIsland ? createIslandDraft(selectedIsland) : null);
  const polygonDirty =
    polygonDraft !== null &&
    isDraftDirty(polygonDraft, selectedPolygon && polygonDraft.kind === "edit" ? selectedPolygon : null);
  const selectedPolygonSet = useMemo(
    () => new Set(selectedPolygonIds),
    [selectedPolygonIds],
  );

  const canApplyUnionLike = selectedPolygonIds.length >= 2 && !polygonDraft;
  const canApplyDifference = selectedPolygonIds.length === 2 && !polygonDraft;

  const overlayPolygons = polygons.filter(
    (polygon) => polygonDraft?.kind !== "edit" || polygon.id !== polygonDraft.id,
  );

  if (mapQuery.isLoading) {
    return <div className="text-muted-foreground">Loading editor...</div>;
  }

  if (!map || !isInfiniteMap(map)) {
    return <div className="text-muted-foreground">Loading editor...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/maps/$id" params={{ id }}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-3xl font-bold tracking-tight">
            {map.name ?? "Unnamed Map"} Editor
          </h2>
          <p className="font-mono text-sm text-muted-foreground">{map.id}</p>
        </div>
        <Badge variant="secondary">Revision {editorRevision ?? map.revision}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={tool === "select" ? "default" : "outline"}
          onClick={() => setTool("select")}
        >
          Select
        </Button>
        <Button
          variant={tool === "pan" ? "default" : "outline"}
          onClick={() => setTool("pan")}
        >
          Pan
        </Button>
        <Button
          variant={tool === "draw-polygon" ? "default" : "outline"}
          onClick={() => {
            setTool("draw-polygon");
            setPolygonDraft(createPolygonDraft());
            setControlPointDraft(null);
            clearSelections();
          }}
        >
          Draw Polygon
        </Button>
        <Button
          variant={tool === "edit-vertices" ? "default" : "outline"}
          disabled={!selectedPolygon}
          onClick={beginVertexEdit}
        >
          Edit Vertices
        </Button>
        <Button
          variant={tool === "place-control-point" ? "default" : "outline"}
          onClick={() => {
            setTool("place-control-point");
            setControlPointDraft(null);
            setPolygonDraft(null);
            clearSelections();
          }}
        >
          Add Control Point
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!canApplyUnionLike}
            onClick={() => void applyBooleanOperation("union")}
          >
            Union
          </Button>
          <Button
            variant="outline"
            disabled={!canApplyDifference}
            onClick={() => void applyBooleanOperation("difference")}
          >
            Difference
          </Button>
          <Button
            variant="outline"
            disabled={!canApplyUnionLike}
            onClick={() => void applyBooleanOperation("intersection")}
          >
            Intersection
          </Button>
          <Button
            variant="outline"
            disabled={!canApplyUnionLike}
            onClick={() => void applyBooleanOperation("xor")}
          >
            XOR
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Terrain Editor</CardTitle>
              <CardDescription>
                Drag to pan, scroll to zoom, click to author objects, and use
                shift-click for ordered boolean selection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <div
                  ref={containerRef}
                  className="relative h-[640px] overflow-hidden rounded-md border bg-[#0a1320]"
                >
                  {size.width > 0 && size.height > 0 && (
                    <>
                      <MapStage
                        canvasHeight={size.height}
                        canvasWidth={size.width}
                        chunks={chunks}
                        map={map}
                        viewport={viewport}
                      />
                      <div
                        className="absolute inset-0"
                        onWheelCapture={handleWheelCapture}
                      >
                        <svg
                          ref={interactionRef}
                          className="absolute inset-0 outline-none"
                          height={size.height}
                          onClick={handleCanvasClick}
                          onKeyDown={handleKeyDown}
                          onPointerCancel={handleCanvasPointerCancel}
                          onPointerDown={handleCanvasPointerDown}
                          onPointerLeave={handleCanvasPointerLeave}
                          onPointerMove={handleCanvasPointerMove}
                          onPointerUp={handleCanvasPointerUp}
                          onWheel={onWheel}
                          tabIndex={0}
                          viewBox={`0 0 ${size.width} ${size.height}`}
                          width={size.width}
                          style={{
                            cursor:
                              dragState
                                ? "grabbing"
                                : tool === "draw-polygon"
                                  ? "crosshair"
                                  : tool === "place-control-point"
                                    ? "copy"
                                    : tool === "pan"
                                      ? "grab"
                                      : "default",
                          }}
                        >
                          {overlayPolygons.map((polygon) => {
                            const points = polygon.vertices
                              .map((vertex) => {
                                const screen = toScreenPoint(vertex);
                                return `${screen.x},${screen.z}`;
                              })
                              .join(" ");
                            const selected = selectedPolygonSet.has(polygon.id);
                            const highlighted = highlightedIslandPolygonIds.has(polygon.id);

                            return (
                              <polygon
                                key={polygon.id}
                                fill={selected ? "rgba(244, 114, 182, 0.24)" : highlighted ? "rgba(14, 165, 233, 0.22)" : "rgba(255,255,255,0.08)"}
                                onClick={(event) => {
                                  STOP_PROPAGATION(event);
                                  setSelectedPolygonIds((selection) =>
                                    nextOrderedSelection(
                                      selection,
                                      polygon.id,
                                      event.shiftKey,
                                    ),
                                  );
                                  setSelectedControlPointId(null);
                                  setSelectedIslandId(null);
                                  if (tool !== "edit-vertices") {
                                    setPolygonDraft(null);
                                  }
                                }}
                                onPointerDown={STOP_PROPAGATION}
                                points={points}
                                stroke={selected ? "#f472b6" : highlighted ? "#38bdf8" : "rgba(255,255,255,0.4)"}
                                strokeWidth={selected ? 3 : 2}
                              />
                            );
                          })}

                          {polygonDraft && (
                            <>
                              <polygon
                                fill={
                                  polygonDraft.kind === "create"
                                    ? "rgba(34,197,94,0.18)"
                                    : "rgba(250,204,21,0.18)"
                                }
                                points={polygonDraft.vertices
                                  .map((vertex) => {
                                    const screen = toScreenPoint(vertex);
                                    return `${screen.x},${screen.z}`;
                                  })
                                  .join(" ")}
                                stroke={
                                  polygonDraft.kind === "create" ? "#22c55e" : "#facc15"
                                }
                                strokeWidth={2}
                              />
                              {polygonDraft.vertices.map((vertex, index) => {
                                const screen = toScreenPoint(vertex);
                                const isFirst = index === 0;
                                const selected = index === polygonDraft.selectedVertexIndex;

                                return (
                                  <circle
                                    key={`${vertex.x}:${vertex.z}:${index}`}
                                    cx={screen.x}
                                    cy={screen.z}
                                    fill={selected ? "#ffffff" : isFirst && tool === "draw-polygon" ? "#86efac" : "#0f172a"}
                                    onClick={(event) => {
                                      STOP_PROPAGATION(event);
                                      if (
                                        tool === "draw-polygon" &&
                                        isFirst &&
                                        canSavePolygonDraft(
                                          polygonDraft.vertices,
                                          polygonDraft.params,
                                        )
                                      ) {
                                        commitDrawPolygon();
                                        return;
                                      }

                                      setPolygonDraft((draft) =>
                                        draft
                                          ? {
                                              ...draft,
                                              selectedVertexIndex: index,
                                            }
                                          : draft,
                                      );
                                    }}
                                    onPointerDown={(event) => {
                                      STOP_PROPAGATION(event);
                                      if (tool !== "edit-vertices") {
                                        return;
                                      }

                                      interactionRef.current?.setPointerCapture(event.pointerId);
                                      setDragState({
                                        kind: "vertex",
                                        pointerId: event.pointerId,
                                        vertexIndex: index,
                                      });
                                      setPolygonDraft((draft) =>
                                        draft
                                          ? {
                                              ...draft,
                                              selectedVertexIndex: index,
                                            }
                                          : draft,
                                      );
                                    }}
                                    r={isFirst && tool === "draw-polygon" ? 8 : 6}
                                    stroke={selected ? "#22c55e" : "#ffffff"}
                                    strokeWidth={2}
                                  />
                                );
                              })}
                              {tool === "edit-vertices" &&
                                polygonDraft.vertices.map((vertex, index) => {
                                  const next =
                                    polygonDraft.vertices[
                                      (index + 1) % polygonDraft.vertices.length
                                    ];
                                  if (!next) {
                                    return null;
                                  }

                                  const from = toScreenPoint(vertex);
                                  const to = toScreenPoint(next);

                                  return (
                                    <line
                                      key={`edge-${index}`}
                                      onClick={(event) => {
                                        STOP_PROPAGATION(event);
                                        const world = toWorldPoint(
                                          event as unknown as PointerEvent<SVGSVGElement>,
                                        );
                                        const insertAt = getPolygonEdgeInsertPosition(
                                          vertex,
                                          next,
                                          world,
                                        );
                                        setPolygonDraft((draft) =>
                                          draft
                                            ? {
                                                ...draft,
                                                selectedVertexIndex: index + 1,
                                                vertices: [
                                                  ...draft.vertices.slice(0, index + 1),
                                                  insertAt,
                                                  ...draft.vertices.slice(index + 1),
                                                ],
                                              }
                                            : draft,
                                        );
                                      }}
                                      onPointerDown={STOP_PROPAGATION}
                                      stroke="transparent"
                                      strokeWidth={14}
                                      x1={from.x}
                                      x2={to.x}
                                      y1={from.z}
                                      y2={to.z}
                                    />
                                  );
                                })}
                            </>
                          )}

                          {controlPoints.map((point) => {
                            const screen = toScreenPoint(point);
                            const selected = point.id === selectedControlPointId;
                            return (
                              <g key={point.id}>
                                <circle
                                  cx={screen.x}
                                  cy={screen.z}
                                  fill={selected ? "#f97316" : "#e2e8f0"}
                                  onClick={(event) => {
                                    STOP_PROPAGATION(event);
                                    setSelectedControlPointId(point.id);
                                    setSelectedPolygonIds([]);
                                    setSelectedIslandId(null);
                                    setPolygonDraft(null);
                                  }}
                                  onPointerDown={(event) => {
                                    STOP_PROPAGATION(event);
                                    interactionRef.current?.setPointerCapture(event.pointerId);
                                    setSelectedControlPointId(point.id);
                                    setSelectedPolygonIds([]);
                                    setSelectedIslandId(null);
                                    setDragState({
                                      kind: "control-point",
                                      pointId: point.id,
                                      pointerId: event.pointerId,
                                    });
                                  }}
                                  r={7}
                                  stroke="#0f172a"
                                  strokeWidth={2}
                                />
                                {(selected || controlPointDraft?.id === point.id) && (
                                  <circle
                                    cx={screen.x}
                                    cy={screen.z}
                                    fill="transparent"
                                    pointerEvents="none"
                                    r={
                                      (controlPointDraft?.id === point.id
                                        ? controlPointDraft.influenceMeters
                                        : point.influenceMeters) /
                                      map.resolution.metersPerTile *
                                      viewport.zoom
                                    }
                                    stroke="rgba(249,115,22,0.45)"
                                    strokeDasharray="8 6"
                                    strokeWidth={2}
                                  />
                                )}
                              </g>
                            );
                          })}

                          {controlPointDraft && (
                            <>
                              <circle
                                cx={toScreenPoint(controlPointDraft).x}
                                cy={toScreenPoint(controlPointDraft).z}
                                fill="transparent"
                                pointerEvents="none"
                                r={
                                  controlPointDraft.influenceMeters /
                                  map.resolution.metersPerTile *
                                  viewport.zoom
                                }
                                stroke="rgba(251,146,60,0.4)"
                                strokeDasharray="8 6"
                                strokeWidth={2}
                              />
                              <circle
                                cx={toScreenPoint(controlPointDraft).x}
                                cy={toScreenPoint(controlPointDraft).z}
                                fill="#fb923c"
                                pointerEvents="none"
                                r={8}
                                stroke="#fff7ed"
                                strokeWidth={2}
                              />
                            </>
                          )}
                        </svg>
                      </div>
                      <div className="absolute right-3 bottom-3 flex gap-1">
                        <Button
                          className="h-8 w-8"
                          onClick={zoomIn}
                          size="icon"
                          title="Zoom in"
                          variant="secondary"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          className="h-8 w-8"
                          onClick={zoomOut}
                          size="icon"
                          title="Zoom out"
                          variant="secondary"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Button
                          className="h-8 w-8"
                          onClick={fitToView}
                          size="icon"
                          title="Reset view"
                          variant="secondary"
                        >
                          <Home className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Infinite · Zoom {zoomPercent}%</span>
                  <span>
                    {tool === "draw-polygon"
                      ? "Click to place vertices · Enter or first vertex to save · Esc to cancel"
                      : "Drag to pan · Scroll to zoom · Delete removes selected items"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>
                Click to recenter. Drag the viewport frame to pan the main view.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OverviewPane
                bounds={overviewBounds}
                clusters={overviewQuery.data?.clusters ?? []}
                onRecenter={recenterOnWorldPoint}
                viewportBounds={viewportWorldBounds}
              />
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{overviewQuery.data?.counts.sourcePolygons ?? 0} polygons</span>
                <span>{overviewQuery.data?.counts.controlPoints ?? 0} controls</span>
                <span>{overviewQuery.data?.counts.derivedIslands ?? 0} islands</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Polygon Inspector</CardTitle>
              <CardDescription>
                Edit terrain params and save polygon changes per operation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentPolygonForInspector ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="polygon-noise-scale">Noise Scale</Label>
                    <Input
                      id="polygon-noise-scale"
                      type="number"
                      value={currentPolygonForInspector.params.noiseScaleMeters}
                      onChange={(event) => {
                        const noiseScaleMeters = parseNumber(
                          event.target.value,
                          currentPolygonForInspector.params.noiseScaleMeters,
                        );
                        setPolygonDraft((draft) => ({
                          ...(draft ?? createPolygonDraft(selectedPolygon ?? undefined)),
                          params: {
                            ...(draft?.params ??
                              selectedPolygon?.params ??
                              DEFAULT_SOURCE_POLYGON_PARAMS),
                            noiseScaleMeters,
                          },
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="polygon-displacement">Max Displacement</Label>
                    <Input
                      id="polygon-displacement"
                      type="number"
                      value={currentPolygonForInspector.params.maxDisplacementMeters}
                      onChange={(event) => {
                        const maxDisplacementMeters = parseNumber(
                          event.target.value,
                          currentPolygonForInspector.params.maxDisplacementMeters,
                        );
                        setPolygonDraft((draft) => ({
                          ...(draft ?? createPolygonDraft(selectedPolygon ?? undefined)),
                          params: {
                            ...(draft?.params ??
                              selectedPolygon?.params ??
                              DEFAULT_SOURCE_POLYGON_PARAMS),
                            maxDisplacementMeters,
                          },
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="polygon-roughness">Roughness</Label>
                    <Input
                      id="polygon-roughness"
                      step="0.05"
                      type="number"
                      value={currentPolygonForInspector.params.roughness}
                      onChange={(event) => {
                        const roughness = parseNumber(
                          event.target.value,
                          currentPolygonForInspector.params.roughness,
                        );
                        setPolygonDraft((draft) => ({
                          ...(draft ?? createPolygonDraft(selectedPolygon ?? undefined)),
                          params: {
                            ...(draft?.params ??
                              selectedPolygon?.params ??
                              DEFAULT_SOURCE_POLYGON_PARAMS),
                            roughness,
                          },
                        }));
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={
                        !polygonDraft ||
                        !canSavePolygonDraft(
                          currentPolygonForInspector.vertices,
                          currentPolygonForInspector.params,
                        ) ||
                        !polygonDirty
                      }
                      onClick={() => void savePolygonDraft()}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      disabled={!polygonDraft}
                      onClick={resetPolygonDraft}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    {selectedPolygon && (
                      <Button
                        onClick={() =>
                          setDeleteTarget({ id: selectedPolygon.id, kind: "polygon" })}
                        variant="destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Select a polygon or start drawing one.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Control Point Inspector</CardTitle>
              <CardDescription>
                Place, move, and tune local terrain controls before saving.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentControlPointForInspector ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="control-type">Type</Label>
                      <Select
                        id="control-type"
                        value={currentControlPointForInspector.type}
                        onChange={(event) =>
                          setControlPointDraft((draft) => ({
                            ...(draft ?? createControlPointDraft(selectedControlPoint ?? undefined)),
                            type: event.target.value as ControlPoint["type"],
                          }))}
                      >
                        <option value="plain">Plain</option>
                        <option value="peak">Peak</option>
                        <option value="valley">Valley</option>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="control-strength">Strength</Label>
                      <Input
                        id="control-strength"
                        step="0.1"
                        type="number"
                        value={currentControlPointForInspector.strength}
                        onChange={(event) =>
                          setControlPointDraft((draft) => ({
                            ...(draft ?? createControlPointDraft(selectedControlPoint ?? undefined)),
                            strength: parseNumber(
                              event.target.value,
                              currentControlPointForInspector.strength,
                            ),
                          }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="control-elevation">Elevation</Label>
                      <Input
                        id="control-elevation"
                        type="number"
                        value={currentControlPointForInspector.elevationMeters}
                        onChange={(event) =>
                          setControlPointDraft((draft) => ({
                            ...(draft ?? createControlPointDraft(selectedControlPoint ?? undefined)),
                            elevationMeters: parseNumber(
                              event.target.value,
                              currentControlPointForInspector.elevationMeters,
                            ),
                          }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="control-influence">Influence Radius</Label>
                      <Input
                        id="control-influence"
                        type="number"
                        value={currentControlPointForInspector.influenceMeters}
                        onChange={(event) =>
                          setControlPointDraft((draft) => ({
                            ...(draft ?? createControlPointDraft(selectedControlPoint ?? undefined)),
                            influenceMeters: parseNumber(
                              event.target.value,
                              currentControlPointForInspector.influenceMeters,
                            ),
                          }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="control-x">X</Label>
                      <Input
                        id="control-x"
                        type="number"
                        value={currentControlPointForInspector.x}
                        onChange={(event) =>
                          setControlPointDraft((draft) => ({
                            ...(draft ?? createControlPointDraft(selectedControlPoint ?? undefined)),
                            x: parseNumber(event.target.value, currentControlPointForInspector.x),
                          }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="control-z">Z</Label>
                      <Input
                        id="control-z"
                        type="number"
                        value={currentControlPointForInspector.z}
                        onChange={(event) =>
                          setControlPointDraft((draft) => ({
                            ...(draft ?? createControlPointDraft(selectedControlPoint ?? undefined)),
                            z: parseNumber(event.target.value, currentControlPointForInspector.z),
                          }))}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!controlPointDraft}
                      onClick={() => void saveControlPointDraft()}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      disabled={!controlPointDraft}
                      onClick={resetControlPointDraft}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    {selectedControlPoint && (
                      <Button
                        onClick={() =>
                          setDeleteTarget({
                            id: selectedControlPoint.id,
                            kind: "control-point",
                          })}
                        variant="destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Select a control point or use Add Control Point.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Derived Islands</CardTitle>
              <CardDescription>
                Selecting an island recenters the view and highlights its source polygons.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-56 space-y-2 overflow-auto">
                {derivedIslands.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No derived islands yet.
                  </div>
                )}
                {derivedIslands.map((island) => (
                  <Button
                    className="w-full justify-between"
                    key={island.id}
                    onClick={() => {
                      setSelectedIslandId(island.id);
                      setIslandDraft(createIslandDraft(island));
                      setSelectedControlPointId(null);
                      setSelectedPolygonIds([]);
                      recenterOnWorldPoint(getBoundsCenter(island.bbox));
                    }}
                    variant={selectedIslandId === island.id ? "default" : "outline"}
                  >
                    <span className="truncate">{island.name ?? island.id}</span>
                    <span className="text-xs">{Math.round(island.areaMeters2)}m²</span>
                  </Button>
                ))}
              </div>
              {islandInspectorDraft && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="island-name">Name</Label>
                    <Input
                      id="island-name"
                      value={islandInspectorDraft.name}
                      onChange={(event) =>
                        setIslandDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                name: event.target.value,
                              }
                            : draft,
                        )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="island-owner">Default Owner</Label>
                    <Input
                      id="island-owner"
                      value={islandInspectorDraft.defaultOwner}
                      onChange={(event) =>
                        setIslandDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                defaultOwner: event.target.value,
                              }
                            : draft,
                        )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="island-faction">Default Faction</Label>
                    <Input
                      id="island-faction"
                      value={islandInspectorDraft.defaultFaction}
                      onChange={(event) =>
                        setIslandDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                defaultFaction: event.target.value,
                              }
                            : draft,
                        )}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={!islandDraft}
                      onClick={() => void saveIslandDraft()}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      disabled={!islandDraft}
                      onClick={() =>
                        setIslandDraft(selectedIsland ? createIslandDraft(selectedIsland) : null)}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget?.kind === "polygon" ? "Polygon" : "Control Point"}
            </DialogTitle>
            <DialogDescription>
              This will remove the selected authored object and refresh affected terrain
              chunks after the mutation succeeds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteTarget(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={pendingAction !== null}
              onClick={() => void confirmDelete()}
              variant="destructive"
            >
              {pendingAction ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type OverviewPaneProps = {
  bounds: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ"> | null;
  clusters: ReadonlyArray<{
    bbox: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ">;
    controlPointCount: number;
    derivedIslandCount: number;
    sourcePolygonCount: number;
  }>;
  onRecenter: (point: Pick<WorldPoint, "x" | "z">) => void;
  viewportBounds: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ"> | null;
};

function OverviewPane({
  bounds,
  clusters,
  onRecenter,
  viewportBounds,
}: OverviewPaneProps) {
  const dragRef = useRef<{ dx: number; dz: number } | null>(null);
  const draggedRef = useRef(false);

  const toRelative = useCallback(
    (point: Pick<WorldPoint, "x" | "z">) => {
      if (!bounds) {
        return { x: 50, z: 50 };
      }

      const width = Math.max(bounds.maxX - bounds.minX, 1);
      const height = Math.max(bounds.maxZ - bounds.minZ, 1);

      return {
        x: ((point.x - bounds.minX) / width) * 100,
        z: ((point.z - bounds.minZ) / height) * 100,
      };
    },
    [bounds],
  );

  const toWorld = useCallback(
    (event: {
      clientX: number;
      clientY: number;
      currentTarget: { getBoundingClientRect(): DOMRect };
    }) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const relativeX = (event.clientX - rect.left) / rect.width;
      const relativeZ = (event.clientY - rect.top) / rect.height;

      if (!bounds) {
        return { x: 0, z: 0 };
      }

      return {
        x: bounds.minX + (bounds.maxX - bounds.minX) * relativeX,
        z: bounds.minZ + (bounds.maxZ - bounds.minZ) * relativeZ,
      };
    },
    [bounds],
  );

  if (!bounds || !viewportBounds) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        Overview will appear once the viewport is ready.
      </div>
    );
  }

  const topLeft = toRelative({ x: viewportBounds.minX, z: viewportBounds.minZ });
  const bottomRight = toRelative({ x: viewportBounds.maxX, z: viewportBounds.maxZ });
  const center = getBoundsCenter(viewportBounds);

  return (
    <div
      className="relative h-56 overflow-hidden rounded-md border bg-slate-950"
      onClick={(event) => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }

        if (dragRef.current) {
          return;
        }

        onRecenter(toWorld(event));
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) {
          return;
        }

        draggedRef.current = true;

        onRecenter({
          x: toWorld(event).x + dragRef.current.dx,
          z: toWorld(event).z + dragRef.current.dz,
        });
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
    >
      {clusters.map((cluster, index) => {
        const position = toRelative({
          x: (cluster.bbox.minX + cluster.bbox.maxX) / 2,
          z: (cluster.bbox.minZ + cluster.bbox.maxZ) / 2,
        });

        return (
          <div
            className="absolute h-3 w-3 rounded-full bg-sky-400"
            key={`${cluster.bbox.minX}:${cluster.bbox.minZ}:${index}`}
            style={{
              left: `${position.x}%`,
              top: `${position.z}%`,
              transform: "translate(-50%, -50%)",
            }}
            title={`${cluster.sourcePolygonCount} polygons · ${cluster.controlPointCount} controls · ${cluster.derivedIslandCount} islands`}
          />
        );
      })}
      <div
        className="absolute border-2 border-emerald-300/90 bg-emerald-300/10"
        onPointerDown={(event) => {
          STOP_PROPAGATION(event);
          const pointerWorld = toWorld(event);
          dragRef.current = {
            dx: center.x - pointerWorld.x,
            dz: center.z - pointerWorld.z,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        style={{
          height: `${Math.max(bottomRight.z - topLeft.z, 4)}%`,
          left: `${topLeft.x}%`,
          top: `${topLeft.z}%`,
          width: `${Math.max(bottomRight.x - topLeft.x, 4)}%`,
        }}
      />
    </div>
  );
}
