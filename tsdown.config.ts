/**
 * Standalone build config for the @adenxie/dsh-vercel plugin.
 *
 * Uses the bundled shared client-bundle preset (shared/tsdown.client.ts,
 * vendored from the dsh-web-ui family repo): node-half lib/ plus the
 * browser bundle lib/client.js (closure-factory artifact for the GUI's
 * __ModuleLoader__, served at /plugins/adenxie-dsh-vercel/client.js).
 */
import { clientBundle } from './shared/tsdown.client.ts'

// DSH's browser module table is keyed by the resolved package name, which
// must match the client-manifest entry. The settings section keeps its own ID.
export default clientBundle('@adenxie/dsh-vercel', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools',
  ],
})
