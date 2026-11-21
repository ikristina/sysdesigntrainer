import { siCloudflare } from 'simple-icons'
import { cdn } from '../cdn'
import { presetBlock } from './preset'

export const cloudflare = presetBlock({
  id: 'cloudflare', base: cdn, label: 'Cloudflare', logo: siCloudflare,
  cost: 20 / 730,
  facts: [
    'Flat monthly plan: CDN traffic is included, not billed per request',
    'Pro plan: $20/month billed annually',
  ],
  sources: { cost: 'https://www.cloudflare.com/plans/network-cdn/ (Pro $20/mo billed annually, ÷ 730 hours)' },
  estimates: [],
  notes: 'The plans page lists CDN as "Included" but does not say in so many words that requests are never billed. Hit ratio and capacity are the generic CDN estimates.',
})
