import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Map, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { client } from '@/lib/api-client';

export function DashboardPage() {
  const mapsQuery = useQuery({
    queryFn: () => client.maps.list({}),
    queryKey: ['maps']
  });

  const maps = mapsQuery.data ?? [];
  const latestMap = maps[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">System overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Maps</CardTitle>
            <Map className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mapsQuery.isLoading ? '...' : maps.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latest Map</CardTitle>
            <Map className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {latestMap ? (
              <>
                <div className="text-2xl font-bold">
                  {latestMap.name ?? 'Unnamed'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {latestMap.widthTiles}&times;{latestMap.heightTiles} tiles
                </p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                {mapsQuery.isLoading ? 'Loading...' : 'No maps yet'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/maps/new">
              <Button variant="outline" className="w-full justify-start">
                <Plus className="mr-2 h-4 w-4" />
                Create Map
              </Button>
            </Link>
            <Link to="/maps">
              <Button variant="outline" className="w-full justify-start">
                <Map className="mr-2 h-4 w-4" />
                View All Maps
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {latestMap && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Maps</CardTitle>
            <CardDescription>
              Last updated maps in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {maps.slice(0, 5).map(map => (
                <Link
                  key={map.id}
                  to="/maps/$id"
                  params={{ id: map.id }}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <div>
                    <div className="font-medium">
                      {map.name ?? 'Unnamed'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {map.widthTiles}&times;{map.heightTiles} tiles &middot;{' '}
                      {map.generator}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(map.updatedAt).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
