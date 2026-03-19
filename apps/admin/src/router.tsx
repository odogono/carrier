import { Layout } from '@/components/layout';
import { DashboardPage } from '@/pages/dashboard';
import { CreateMapPage } from '@/pages/maps/create';
import { MapDetailPage } from '@/pages/maps/detail';
import { MapEditorPage } from '@/pages/maps/editor';
import { MapsListPage } from '@/pages/maps/list';
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter
} from '@tanstack/react-router';

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  )
});

const dashboardRoute = createRoute({
  component: DashboardPage,
  getParentRoute: () => rootRoute,
  path: '/'
});

const mapsRoute = createRoute({
  component: MapsListPage,
  getParentRoute: () => rootRoute,
  path: '/maps'
});

const createMapRoute = createRoute({
  component: CreateMapPage,
  getParentRoute: () => rootRoute,
  path: '/maps/new'
});

const mapDetailRoute = createRoute({
  component: MapDetailPage,
  getParentRoute: () => rootRoute,
  path: '/maps/$id'
});

const mapEditorRoute = createRoute({
  component: MapEditorPage,
  getParentRoute: () => rootRoute,
  path: '/maps/$id/editor'
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  mapsRoute,
  createMapRoute,
  mapEditorRoute,
  mapDetailRoute
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
