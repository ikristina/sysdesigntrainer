// Source links shared by several presets. AWS prices: the official AWS Price List files
// (us-east-1, on-demand), read 2026-11-20. The marketing pricing pages render prices with JS.
export const awsPrices = (service: string) =>
  `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${service}/current/us-east-1/index.json (read 2026-11-20)`
