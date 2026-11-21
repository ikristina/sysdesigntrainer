// Source links shared by several presets. AWS prices: the official AWS Price List files
// (us-east-1, on-demand), read 2026-11-20. The marketing pricing pages render prices with JS.
export const awsPrices = (service: string) =>
  `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${service}/current/us-east-1/index.json (read 2026-11-20)`

/** cache.r7g.large usable memory, the node all three cache presets are priced on. */
export const R7G_LARGE_GB = 13.07
export const r7gLargeMemory = 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/CacheNodes.SupportedTypes.html'
  + ' (cache.r7g.large: Memory (GiB) 13.07, read 2026-11-20)'
