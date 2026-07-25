import { useEffect, useState } from "react";
import { Navigate } from "@/lib/router-compat";
import TodaysWorklistPage from "@/pages/TodaysWorklistPage";
import { getHomePref, HOME_PREF_EVENT, type HomePref } from "@/lib/homePreference";

/** Renders the home page based on the user's saved preference. */
export default function HomeGate() {
  const [pref, setPref] = useState<HomePref>(() => getHomePref());
  useEffect(() => {
    const h = () => setPref(getHomePref());
    window.addEventListener(HOME_PREF_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(HOME_PREF_EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  if (pref === "dashboard") return <Navigate to="/dashboard" replace />;
  return <TodaysWorklistPage />;
}
