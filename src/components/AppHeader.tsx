import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "@/lib/router-compat";
import { Input } from "@/components/ui/input";

const SEARCH_ROUTES: { match: (p: string) => boolean; placeholder: string }[] = [
  { match: (p) => p === "/claims", placeholder: "Search claims — claim no, patient, TPA…" },
  { match: (p) => p === "/follow-up" || p.startsWith("/communications/"), placeholder: "Search follow-ups — patient, claim no, TPA…" },
  { match: (p) => p === "/claims/denials", placeholder: "Search denials — claim no, patient, TPA…" },
];

function searchConfigFor(pathname: string) {
  return SEARCH_ROUTES.find((r) => r.match(pathname));
}

export default function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cfg = searchConfigFor(location.pathname);
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  useEffect(() => { setValue(searchParams.get("q") ?? ""); }, [location.pathname, searchParams]);

  useEffect(() => {
    if (!cfg) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      setSearchParams(next, { replace: true });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    if (!cfg && value.trim()) navigate(`/claims?q=${encodeURIComponent(value.trim())}`);
  };

  // Only render when a route exposes contextual search; otherwise keep top
  // chrome single-purpose (no second bar).
  if (!cfg) return null;

  return (
    <div className="border-b border-border/50 bg-card/60 px-4 md:px-6 py-2">
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onEnter}
          placeholder={cfg.placeholder}
          aria-label="Search"
          data-testid="header-search"
          className="h-9 pl-9 pr-9 text-[13px] rounded-xl bg-card"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setValue("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
