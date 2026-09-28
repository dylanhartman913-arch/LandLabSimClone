import type { Assumptions, Site } from '@homestead/catalog';

/** The site's scalar assumptions (what balance mode uses for that site). */
export function siteAssumptions(site: Site): Assumptions {
  return site.assumptions;
}
