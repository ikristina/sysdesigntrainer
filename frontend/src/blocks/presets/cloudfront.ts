import { cdn } from '../cdn'
import { presetBlock } from './preset'

export const cloudfront = presetBlock({
  id: 'cloudfront', base: cdn, label: 'CloudFront', badge: 'CF',
  cost: 0, requestCost: { read: 1, write: 1 }, transferCost: 0.085,
  facts: [
    'Pay per request ($0.01 per 10k HTTPS in the US) plus per GB transferred',
    'Flat-rate monthly plans exist too',
  ],
  sources: {
    requestCost: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.json ($0.0100 per 10,000 HTTPS requests, United States)',
    transferCost: 'https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/ ("charged at $0.085 per GB after the first TB", USA, read 2026-11-20)',
  },
  estimates: [],
  notes: 'Transfer is priced at $0.085/GB on every read at the traffic payload size; the free first TB a month and the cheaper tiers above 10 TB are ignored. Hit ratio and capacity are the generic CDN estimates.',
})
