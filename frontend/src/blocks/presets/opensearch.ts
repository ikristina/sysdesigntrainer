import { siOpensearch } from 'simple-icons'
import { search } from '../search'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

export const opensearch = presetBlock({
  id: 'opensearch', base: search, label: 'OpenSearch', logo: siOpensearch,
  params: { capacity_rps: 500 },
  cost: 0.167,
  facts: [
    'Open-source fork of Elasticsearch, same query model',
    'An index is split into shards (AWS default: 5 primaries, 1 replica each)',
    'Keep shards 10-30 GiB for search workloads',
  ],
  sources: {
    cost: `${awsPrices('AmazonES')}: OpenSearch Service r6g.large.search, $0.167/hr`,
    shards: 'https://docs.aws.amazon.com/opensearch-service/latest/developerguide/bp-sharding.html',
  },
  estimates: ['capacity_rps'],
  notes: 'No official query rate. capacity_rps 500 simple queries/s is an estimate for a 2 vCPU node (range 100-1,000). Storage is not priced.',
})
