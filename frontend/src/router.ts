import { useSyncExternalStore } from "react";

// Hash routes, e.g. #/incidents?service=fire&view=awaiting&id=INC-0241. Filters and the selected incident live in
// the URL so they survive reloads, back/forward, and moving between pages.
export const PAGES = ["overview", "incidents", "responders", "history", "settings"] as const;
export type Page = (typeof PAGES)[number];
export type Route = { page: Page; params: URLSearchParams };
export type Params = Record<string, string | null | undefined>;

const listeners = new Set<() => void>();
// Last query used on each page, so the sidebar returns to the same filters and selection.
const lastQuery: Partial<Record<Page, string>> = {};

function parse(): Route {
  const [path, query = ""] = window.location.hash.replace(/^#\/?/, "").split("?");
  const page = (PAGES as readonly string[]).includes(path) ? (path as Page) : "overview";
  lastQuery[page] = query;
  return { page, params: new URLSearchParams(query) };
}

let current = parse();
const update = () => {
  current = parse();
  listeners.forEach((listener) => listener());
};
window.addEventListener("hashchange", update);

export function href(page: Page, params: Params = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return `#/${page}${text ? `?${text}` : ""}`;
}

/** The page's link with the filters it was last left on. */
export const lastHref = (page: Page) => `#/${page}${lastQuery[page] ? `?${lastQuery[page]}` : ""}`;

export function navigate(page: Page, params: Params = {}, { replace = false } = {}) {
  const target = href(page, params);
  if (target === window.location.hash) return;
  if (replace) {
    window.history.replaceState(null, "", target);
    update();
  } else {
    window.location.hash = target;
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useRoute = () => useSyncExternalStore(subscribe, () => current);
