// Partitioned store with a per-partition limit (DynamoDB-style). The table scales out, but one
// key lives on one partition, so the hottest key's share of traffic is capped at
// partition_read_rps / partition_write_rps. Above that, requests are throttled (fail).
import type { Handler } from '../types'
import { num, total } from './common'
import { service } from './service'

export const partitioned: Handler = (input) => {
  const { node, inbound, hotKey } = input
  const readCap = num(node.params.partition_read_rps, Infinity)
  const writeCap = num(node.params.partition_write_rps, Infinity)
  const hotR = hotKey * inbound.read, hotW = hotKey * inbound.write
  const thrR = Math.max(0, hotR - readCap), thrW = Math.max(0, hotW - writeCap)
  const r = service({ ...input, inbound: { read: inbound.read - thrR, write: inbound.write - thrW } })
  if (thrR + thrW > 0) {
    r.metrics.lambda = total(inbound)
    r.metrics.dropped += thrR + thrW
    r.metrics.rho = Math.max(r.metrics.rho, hotR / readCap, hotW / writeCap)
    r.metrics.note = 'hot key throttled'
  }
  return r
}
