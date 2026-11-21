import { siRabbitmq } from 'simple-icons'
import { queue } from '../queue'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

export const rabbitmq = presetBlock({
  id: 'rabbitmq', base: queue, label: 'RabbitMQ', logo: siRabbitmq,
  params: { capacity_rps: 20_000 },
  cost: 0.288,
  facts: [
    'Messages are deleted once acknowledged: no replay',
    'FIFO per queue, but redelivery can change the order',
    'Consumers compete: add consumers to drain faster',
  ],
  sources: {
    cost: `${awsPrices('AmazonMQ')}: Amazon MQ RabbitMQ mq.m5.large single instance, $0.288/hr`,
    capacity_rps: 'https://www.rabbitmq.com/blog/2024/08/21/amqp-benchmarks (99k msg/s classic queue, 12-byte messages, 8-core machine)',
    ordering: 'https://www.rabbitmq.com/docs/queues',
  },
  estimates: ['capacity_rps'],
  notes: 'capacity_rps 20k msg/s is an estimate for persistent messages of a realistic size; the benchmark uses 12-byte messages (quorum queues with default flow control: ~10k).',
})
