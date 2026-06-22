// Type declarations for brand.mjs (Stage 84 intro + Stage 85 rename).

export type Brand = {
  productName: string;
  productShortName: string;
  tagline: string;
  metadataTitle: string;
  metadataDescription: string;
  primaryDomain: string;
  developerDomain: string;
  appDomain: string;
  legacyDashboardDomain: string;
};

export const BRAND: Brand;
