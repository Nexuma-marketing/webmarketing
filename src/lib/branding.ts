// Steve 4/29 #13: brand name was hardcoded as "WebMarketing" in the header,
// public homepage, and <title>. The user wanted to rename it to "Nexuma
// Marketing" from the admin panel. We now read it from
// `site_content` (section="branding"), with a hardcoded default fallback so
// the app still renders if the table is empty or unreachable.

export interface SiteBranding {
  name: string;
  shortName: string;
  tagline: string;
}

const DEFAULT_BRANDING: SiteBranding = {
  name: "WebMarketing",
  shortName: "WebMarketing",
  tagline: "Residential & Business Marketing",
};

export function buildBranding(
  rows: { key: string; value: string }[] | null | undefined,
): SiteBranding {
  if (!rows || rows.length === 0) return DEFAULT_BRANDING;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    name: map.site_brand_name?.trim() || DEFAULT_BRANDING.name,
    shortName:
      map.site_short_name?.trim() ||
      map.site_brand_name?.trim() ||
      DEFAULT_BRANDING.shortName,
    tagline: map.site_tagline?.trim() || DEFAULT_BRANDING.tagline,
  };
}

export function getDefaultBranding(): SiteBranding {
  return DEFAULT_BRANDING;
}
