import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import LandingPage from "@/pages/LandingPage";
import LegacyApp from "../_LegacyApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RCM Buddy — Hospital Revenue Cycle Management" },
      {
        name: "description",
        content:
          "RCM Buddy helps Indian hospitals recover insurance claims faster — TPA follow-ups, denial appeals, payer scorecards in one place.",
      },
      { property: "og:title", content: "RCM Buddy — Hospital Revenue Cycle Management" },
      {
        property: "og:description",
        content:
          "Recover insurance claims faster. Built for Indian hospitals, TPAs and corporate billing teams.",
      },
    ],
  }),
  component: IndexRoute,
});

type SessionStatus = "checking" | "authed" | "unauthed";

function IndexRoute() {
  const [status, setStatus] = useState<SessionStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(data.session ? "authed" : "unauthed");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setStatus(session ? "authed" : "unauthed");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthed") {
    return <LandingPage />;
  }

  return <LegacyApp />;
}
