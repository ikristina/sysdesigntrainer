import { siApachekafka } from 'simple-icons'
import { stream } from '../stream'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

export const kafka = presetBlock({
  id: 'kafka', base: stream, label: 'Kafka', logo: siApachekafka,
  params: { capacity_rps: 10_000 },
  cost: 0.63,
  facts: [
    'Each partition is read by one consumer per group: extra consumers sit idle',
    'Ordered within a partition only',
    'Keeps messages after they are read (default retention 7 days), so consumers can replay',
  ],
  sources: {
    cost: `${awsPrices('AmazonMSK')}: MSK kafka.m5.large $0.21/broker-hr × 3 brokers (replication factor 3)`,
    partitions: 'https://kafka.apache.org/44/design/design/ ("consumed by exactly one consumer within each subscribing consumer group")',
    retention: 'https://kafka.apache.org/44/configuration/broker-configs/ (log.retention.hours default 168)',
    capacity_rps: 'https://www.confluent.io/blog/how-choose-number-topics-partitions-kafka-cluster/ ("10s of MB/sec on just a single partition", 2015)',
  },
  estimates: ['capacity_rps'],
  notes: 'capacity_rps 10k msg/s per partition is an estimate: tens of MB/s divided by ~1 KB messages, low end. The block is a 3-broker cluster; storage is not priced.',
})
