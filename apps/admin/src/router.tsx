import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { Layout } from "@/components/layout";
import { CreateMapPage } from "@/pages/maps/create";
import { MapDetailPage } from "@/pages/maps/detail";
import { MapsListPage } from "@/pages/maps/list";
import { DashboardPage } from "@/pages/dashboard";

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const dashboardRoute = createRoute({
  component: DashboardPage,
  getParentRoute: () => rootRoute,
  path: "/",
});

const mapsRoute = createRoute({
  component: MapsListPage,
  getParentRoute: () => rootRoute,
  path: "/maps",
});

const createMapRoute = createRoute({
  component: CreateMapPage,
  getParentRoute: () => rootRoute,
  path: "/maps/new",
});

const mapDetailRoute = createRoute({
  component: MapDetailPage,
  getParentRoute: () => rootRoute,
  path: "/maps/$id",
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  mapsRoute,
  createMapRoute,
  mapDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
