import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig, PluginOption } from 'vite'

// 1. Add all your plugin directory names here
const PLUGINS = ['filtered-dynamic-link', 'localized-boolean', 'sync-blocks-button']

/**
 * Creates Vite dev server middleware to cleanly map requests to plugin HTML files
 */
function datoPluginsDevServer(plugins: string[]): PluginOption {
  return {
    name: 'dato-plugins-dev-server',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next()

        for (const plugin of plugins) {
          const basePath = `/plugins/${plugin}`

          // 1. Map HTML page request
          if (req.url === basePath || req.url === `${basePath}/`) {
            req.url = `/src/plugins/${plugin}/index.html`
            break
          }
          // 2. Map JavaScript/Asset requests relative to the plugin folder
          else if (req.url.startsWith(`${basePath}/`)) {
            req.url = req.url.replace(basePath, `/src/plugins/${plugin}`)
            break
          }
        }

        next()
      })
    },
  }
}

/**
 * Dynamically generates Rollup input object for production multi-page build
 */
function createBuildInputs(plugins: string[]) {
  return plugins.reduce<Record<string, string>>((inputs, plugin) => {
    inputs[plugin] = resolve(__dirname, `src/plugins/${plugin}/index.html`)
    return inputs
  }, {})
}

// 2. Export configuration
export default defineConfig({
  plugins: [react(), datoPluginsDevServer(PLUGINS)],
  build: {
    rollupOptions: {
      input: createBuildInputs(PLUGINS),
    },
  },
})
