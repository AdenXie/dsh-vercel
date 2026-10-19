/**
 * dsh-vercel — browser half. Registers the Vercel MCP settings
 * panel into the web settings page (settings.section entry). The panel
 * drives the OAuth authorize flow, shows connection state, and offers
 * one-click test / refresh / clear. Failure policy: registration problems
 * are logged, never thrown — the web shell fails the whole boot when a
 * plugin apply throws, and an external plugin must not take the GUI down.
 */
// Type-only: pulls the settings-surface SlotMap merge (the 'settings.section'
// entry) and the client runtime Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { VercelMcpSettingsPanel } from './VercelPanel.tsx'

/** Required services. */
export const inject = ['slots']

/**
 * Register the Vercel MCP settings page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  try {
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'adenxie-dsh-vercel',
      order: 320,
      label: () => 'Vercel MCP',
    }, VercelMcpSettingsPanel))
  } catch (error) {
    console.warn('[dsh-vercel] settings panel registration failed:', error)
  }
}
