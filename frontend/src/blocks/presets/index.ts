// Product presets, in palette order. Each one is a normal BlockDef (see preset.ts).
import { cassandra } from './cassandra'
import { cloudflare } from './cloudflare'
import { cloudfront } from './cloudfront'
import { cockroachdb } from './cockroachdb'
import { dynamodb } from './dynamodb'
import { kafka } from './kafka'
import { kinesis } from './kinesis'
import { memcached } from './memcached'
import { mongodb } from './mongodb'
import { mysql } from './mysql'
import { opensearch } from './opensearch'
import { postgres } from './postgres'
import { rabbitmq } from './rabbitmq'
import { redis } from './redis'
import { s3 } from './s3'
import { sqs, sqs_fifo } from './sqs'
import { valkey } from './valkey'

export const presets = [
  cloudfront, cloudflare,
  postgres, mysql, cockroachdb, dynamodb, cassandra, mongodb, opensearch, s3,
  redis, memcached, valkey,
  kafka, kinesis, rabbitmq, sqs, sqs_fifo,
]
