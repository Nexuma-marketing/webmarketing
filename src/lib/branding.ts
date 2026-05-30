// Steve 4/29 #13: brand name was hardcoded as "WebMarketing" in the header,
// public homepage, and <title>. Steve 4/30: also expose logo + cover URLs
// so the user can change the homepage hero image and add a real company
// logo from /admin/content (Site Branding section).

export interface SiteBranding {
  name: string;
  shortName: string;
  tagline: string;
  logoUrl: string;
  coverImageUrl: string;
  faviconUrl: string;
}

const DEFAULT_BRANDING: SiteBranding = {
  name: "Nexuma Marketing",
  shortName: "Nexuma",
  tagline: "Residential & Business Marketing",
  logoUrl: "",
  // Steve 5/6: revert to the Stage 1 approved cover image so any future
  // surface that consumes branding.coverImageUrl shows the original photo.
  coverImageUrl:
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=1000&fit=crop&crop=center",
  faviconUrl: "",
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
    logoUrl: map.site_logo_url?.trim() || DEFAULT_BRANDING.logoUrl,
    coverImageUrl:
      map.site_cover_image_url?.trim() || DEFAULT_BRANDING.coverImageUrl,
    faviconUrl: map.site_favicon_url?.trim() || DEFAULT_BRANDING.faviconUrl,
  };
}

export function getDefaultBranding(): SiteBranding {
  return DEFAULT_BRANDING;
}
