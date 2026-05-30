/**
 * react-router-dom compatibility shim, powered by @tanstack/react-router.
 * Lets the legacy app use the same import surface (Link, useNavigate,
 * useLocation, useSearchParams, Navigate, NavLink) while there is a single
 * TanStack router underneath. No nested BrowserRouter.
 */
import * as React from "react";
import {
  useRouter,
  useRouterState,
  useNavigate as useTsNavigate,
} from "@tanstack/react-router";

type To = string | { pathname?: string; search?: string; hash?: string };

function toHref(to: To): string {
  if (typeof to === "string") return to;
  const p = to.pathname ?? "";
  const s = to.search ?? "";
  const h = to.hash ?? "";
  return `${p}${s.startsWith("?") || !s ? s : `?${s}`}${h.startsWith("#") || !h ? h : `#${h}`}`;
}

interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

export function useNavigate() {
  const tsNav = useTsNavigate();
  return React.useCallback(
    (to: To | number, opts?: NavigateOptions) => {
      if (typeof to === "number") {
        if (typeof window !== "undefined") window.history.go(to);
        return;
      }
      // Use any-cast: TanStack's typed navigate requires registered routes;
      // we intentionally accept arbitrary string paths here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tsNav({ to: toHref(to), replace: opts?.replace } as any);
    },
    [tsNav],
  );
}

export function useLocation() {
  const loc = useRouterState({ select: (s) => s.location });
  return {
    pathname: loc.pathname,
    search: loc.searchStr ?? "",
    hash: loc.hash ?? "",
    state: (loc.state as unknown) ?? null,
    key: loc.href,
  };
}

type SetParamsArg =
  | URLSearchParams
  | Record<string, string>
  | ((prev: URLSearchParams) => URLSearchParams | Record<string, string>);

export function useSearchParams(): [
  URLSearchParams,
  (next: SetParamsArg, opts?: NavigateOptions) => void,
] {
  const loc = useLocation();
  const navigate = useNavigate();
  const params = React.useMemo(
    () => new URLSearchParams(loc.search.startsWith("?") ? loc.search.slice(1) : loc.search),
    [loc.search],
  );
  const setParams = React.useCallback(
    (next: SetParamsArg, opts?: NavigateOptions) => {
      const computed = typeof next === "function" ? next(new URLSearchParams(params)) : next;
      const usp =
        computed instanceof URLSearchParams
          ? computed
          : new URLSearchParams(computed as Record<string, string>);
      const qs = usp.toString();
      navigate({ pathname: loc.pathname, search: qs ? `?${qs}` : "", hash: loc.hash }, opts);
    },
    [params, navigate, loc.pathname, loc.hash],
  );
  return [params, setParams];
}

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: To;
  replace?: boolean;
  state?: unknown;
  end?: boolean;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, replace, state: _state, onClick, target, children, ...rest }, ref) => {
    const navigate = useNavigate();
    const href = toHref(to);
    const handle = (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (target && target !== "_self") return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to, { replace });
    };
    return (
      <a ref={ref} href={href} onClick={handle} target={target} {...rest}>
        {children}
      </a>
    );
  },
);
Link.displayName = "Link";

export interface NavLinkProps extends Omit<LinkProps, "className" | "children"> {
  className?: string | ((args: { isActive: boolean; isPending: boolean }) => string);
  children?: React.ReactNode | ((args: { isActive: boolean; isPending: boolean }) => React.ReactNode);
  end?: boolean;
}

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ to, end, className, children, ...rest }, ref) => {
    const loc = useLocation();
    const href = toHref(to);
    const targetPath = href.split("?")[0].split("#")[0];
    const isActive = end
      ? loc.pathname === targetPath
      : loc.pathname === targetPath || loc.pathname.startsWith(targetPath + "/");
    const args = { isActive, isPending: false };
    const cls = typeof className === "function" ? className(args) : className;
    const kids = typeof children === "function" ? children(args) : children;
    return (
      <Link ref={ref} to={to} className={cls} data-active={isActive ? "true" : undefined} {...rest}>
        {kids}
      </Link>
    );
  },
);
NavLink.displayName = "NavLink";

export function Navigate({
  to,
  replace = true,
  state,
}: {
  to: To;
  replace?: boolean;
  state?: unknown;
}) {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate(to, { replace, state });
  }, [navigate, to, replace, state]);
  return null;
}

/** Re-export for code that still references the type. */
export type { LinkProps as RouterLinkProps };

/**
 * Compatibility no-ops so imports referencing BrowserRouter / Routes / Route
 * don't break during the migration. The real router is TanStack — these
 * should not be used in new code.
 */
export function BrowserRouter({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function Routes({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function Route() {
  return null;
}

/** Re-export the underlying router instance accessor for advanced cases. */
export { useRouter };
