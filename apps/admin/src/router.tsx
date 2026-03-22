import { Layout } from '@/components/layout';
import { ArchetypesPage } from '@/pages/archetypes';
import { AssetsPage } from '@/pages/assets';
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

const assetsRoute = createRoute({
  component: AssetsPage,
  getParentRoute: () => rootRoute,
  path: '/assets'
});

const archetypesRoute = createRoute({
  component: ArchetypesPage,
  getParentRoute: () => rootRoute,
  path: '/archetypes'
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
  assetsRoute,
  archetypesRoute,
  mapsRoute,
  createMapRoute,
  mapEditorRoute,
  mapDetailRoute
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  type Register = {
    router: typeof router;
  }
}
