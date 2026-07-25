// User preference: which page should "/" render.
// "today" (default) = Today's Worklist; "dashboard" = classic Dashboard.
export type HomePref = "today" | "dashboard";
const KEY = "rcm-home-default";
export const HOME_PREF_EVENT = "rcm-home-pref-change";

export function getHomePref(): HomePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dashboard" ? "dashboard" : "today";
  } catch { return "today"; }
}

export function setHomePref(v: HomePref) {
  try {
    localStorage.setItem(KEY, v);
    window.dispatchEvent(new Event(HOME_PREF_EVENT));
  } catch { /* noop */ }
}
