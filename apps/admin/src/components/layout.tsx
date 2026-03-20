import { LayoutDashboard, Map, Moon, Sun } from 'lucide-react';
import { type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/theme/context';
import { cn } from '@/lib/utils';
import { Link, useRouterState } from '@tanstack/react-router';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/maps', icon: Map, label: 'Maps' }
];

function NavLink({
  href,
  icon: Icon,
  label
}: {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
}) {
  const router = useRouterState();
  const isActive =
    href === '/'
      ? router.location.pathname === '/'
      : router.location.pathname.startsWith(href);

  return (
    <Link
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
        isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
      )}
      to={href}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      className="w-full justify-start"
      onClick={toggleTheme}
      size="sm"
      variant="ghost"
    >
      {theme === 'light' ? (
        <Moon className="mr-2 h-4 w-4" />
      ) : (
        <Sun className="mr-2 h-4 w-4" />
      )}
      {theme === 'light' ? 'Dark mode' : 'Light mode'}
    </Button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <aside className="hidden w-64 flex-shrink-0 border-r bg-sidebar md:block">
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center border-b px-6">
            <h1 className="text-lg font-semibold">Carrier Admin</h1>
          </div>
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map(item => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>
          <div className="border-t p-4">
            <ThemeToggle />
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
