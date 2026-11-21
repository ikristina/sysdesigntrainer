import { cdn } from '../cdn'
import { presetBlock } from './preset'

export const cloudfront = presetBlock({
  id: 'cloudfront', base: cdn, label: 'CloudFront', badge: 'AWS',
  cost: 0, requestCost: { read: 1, write: 1 },
  facts: [
    'Pay per request ($0.01 per 10k HTTPS in the US) plus per GB transferred',
    'Flat-rate monthly plans exist too',
  ],
  sources: {
    requestCost: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.json ($0.0100 per 10,000 HTTPS requests, United States)',
  },
  estimates: [],
  notes: 'Data transfer ($0.085/GB for the first 10 TB in the US) is not priced. Hit ratio and capacity are the generic CDN estimates.',
})
