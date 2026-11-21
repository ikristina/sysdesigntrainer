import { siCloudflare } from 'simple-icons'
import { cdn } from '../cdn'
import { presetBlock } from './preset'

export const cloudflare = presetBlock({
  id: 'cloudflare', base: cdn, label: 'Cloudflare', logo: siCloudflare,
  cost: 20 / 730,
  facts: [
    'Flat monthly plan: CDN traffic is included, not billed per request',
    'Pro plan: $20/month billed annually',
    'Terms: on Free/Pro/Business, video and large files belong on paid add-ons (Stream, Images); Cloudflare may limit a site that serves mostly large files',
  ],
  sources: {
    cost: 'https://www.cloudflare.com/plans/network-cdn/ (Pro $20/mo billed annually, ÷ 730 hours)',
    terms: 'https://www.cloudflare.com/service-specific-terms-application-services/ ("Content Delivery Network (Free, Pro, or Business)", read 2026-11-20)',
  },
  estimates: [],
  notes: 'The plans page lists CDN as "Included" but does not say in so many words that requests or bandwidth are never billed, so the sim prices neither. Hit ratio and capacity are the generic CDN estimates.',
})
