/**
 * Shared Block Consult report branding defaults.
 * These drive both the report CSS design system and the cover/footer chrome so
 * every generated report is institutionally consistent.
 */

export interface Branding {
  brandName: string;
  reportType: string;
  preparedBy: string;
  footerText: string;
  address: string;
  website: string;
  colors: {
    primary: string;
    accent: string;
    muted: string;
    background: string;
    lightPanel: string;
    warning: string;
    danger: string;
    success: string;
  };
  fonts: {
    primary: string;
    mono: string;
  };
  page: {
    size: string;
    marginTop: string;
    marginBottom: string;
    marginLeft: string;
    marginRight: string;
  };
}

export const DEFAULT_BRANDING: Branding = {
  brandName: process.env.BRAND_NAME || "Block Consult GmbH",
  reportType: "Investment Due-Diligence Report",
  preparedBy: process.env.BRAND_PREPARED_BY || "Block Consult GmbH",
  footerText: process.env.BRAND_FOOTER_TEXT || "Private and confidential",
  address: process.env.BRAND_ADDRESS || "",
  website: process.env.BRAND_WEBSITE || "",
  colors: {
    primary: "#0c0d0f",
    accent: "#3176d2",
    muted: "#6b7280",
    background: "#ffffff",
    lightPanel: "#f3f4f6",
    warning: "#b45309",
    danger: "#991b1b",
    success: "#166534",
  },
  fonts: {
    primary: "Geist, Inter, Arial, sans-serif",
    mono: "'Geist Mono', 'IBM Plex Mono', Consolas, monospace",
  },
  page: {
    size: "A4",
    marginTop: "18mm",
    marginBottom: "18mm",
    marginLeft: "16mm",
    marginRight: "16mm",
  },
};

/** File-name helper per design system: Block_Consult_{Project}_DD_Report_YYYY-MM-DD.ext */
export function reportFileBase(projectName: string, brand: string, date: Date): string {
  const safeBrand = brand.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const safeProject = projectName.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const iso = date.toISOString().slice(0, 10);
  return `${safeBrand}_${safeProject}_DD_Report_${iso}`;
}
