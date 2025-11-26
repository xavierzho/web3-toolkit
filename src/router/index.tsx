import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type ComponentPropsWithoutRef } from 'react';

type RouterContextValue = {
  path: string;
  navigate: (to: string) => void;
};

type RouteObject = {
  path: string;
  element: ReactNode;
};

const defaultRouter: RouterContextValue = {
  path: '/',
  navigate: () => {},
};

const RouterContext = createContext<RouterContextValue>(defaultRouter);

const getCurrentPath = () => {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
};

export const RouterProvider = ({ children }: { children: ReactNode }) => {
  const [path, setPath] = useState(getCurrentPath());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setPath(getCurrentPath());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const navigate = useCallback((to: string) => {
    if (typeof window === 'undefined') return;
    if (to === path) return;
    window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [path]);

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
};

export const useRouter = () => useContext(RouterContext);

export const RouteView = ({ routes }: { routes: RouteObject[] }) => {
  const { path } = useRouter();
  const route = routes.find(r => r.path === path) || routes.find(r => r.path === '*');
  return route ? <>{route.element}</> : null;
};

type LinkProps = ComponentPropsWithoutRef<'a'> & {
  to: string;
};

export const Link = ({ to, className, children, ...rest }: LinkProps) => {
  const { navigate } = useRouter();

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(to);
  };

  return (
    <a href={to} onClick={handleClick} className={className} {...rest}>
      {children}
    </a>
  );
};

export type { RouteObject };
