import { queue } from '../queue'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

const quotas = 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html'

// Each message costs ~3 requests: send, receive, delete.
export const sqs = presetBlock({
  id: 'sqs', base: queue, label: 'SQS', badge: 'SQS',
  params: { capacity_rps: 1_000_000 },
  cost: 0, requestCost: { read: 1.2, write: 1.2 },
  facts: [
    'Standard queue: nearly unlimited throughput, no hourly cost',
    'At-least-once delivery, best-effort order: duplicates and reordering happen',
    'Pay per request: ~$1.20 per million messages (send + receive + delete)',
  ],
  sources: {
    capacity_rps: `${quotas} ("nearly unlimited number of API calls per second")`,
    requestCost: `${awsPrices('AWSQueueService')}: $0.40 per million standard requests, × 3 requests per message`,
  },
  estimates: ['capacity_rps'],
  notes: 'capacity_rps 1M stands in for "nearly unlimited". Assumes one message per request: batching up to 10 per request cuts the request cost up to 10×. Free tier (1M requests/month) and 64 KB billing chunks are ignored.',
})

export const sqs_fifo = presetBlock({
  id: 'sqs_fifo', base: queue, label: 'SQS FIFO', badge: 'SQS',
  params: { capacity_rps: 3000 },
  cost: 0, requestCost: { read: 1.5, write: 1.5 },
  facts: [
    'Strict order per message group, exactly-once processing',
    '300 API calls/s per action: 3,000 msg/s with batches of 10 (high-throughput mode: far more)',
    'Pay per request: ~$1.50 per million messages (send + receive + delete)',
  ],
  sources: {
    capacity_rps: `${quotas} ("up to 3,000 messages per second ... 300 API calls, each with a batch of 10")`,
    requestCost: `${awsPrices('AWSQueueService')}: $0.50 per million FIFO requests, × 3 requests per message`,
  },
  estimates: [],
  notes: 'Request cost assumes one message per request (the cap assumes batches of 10, so batched sends would cost less). Without batching the cap is 300 msg/s; with high-throughput mode in us-east-1 it is up to 70k TPS (700k msg/s batched). The sim uses the default batched limit.',
})
