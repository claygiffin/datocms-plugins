import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig, PluginOption } from 'vite'
import fs from 'fs'

const PLUGINS = ['filtered-dynamic-link', 'localized-boolean', 'sync-blocks-button']

/**
 * Moves generated index.html files from dist/src/plugins/[name]/index.html
 * to dist/[name]/index.html after the build finishes.
 */
function relocateHtmlOutputs(plugins: string[]): PluginOption {
  return {
    name: 'relocate-html-outputs',
    closeBundle() {
      for (const plugin of plugins) {
        const srcPath = resolve(__dirname, `dist/src/plugins/${plugin}/index.html`)
        const destDir = resolve(__dirname, `dist/${plugin}`)
        const destPath = resolve(destDir, 'index.html')

        if (fs.existsSync(srcPath)) {
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true })
          }
          fs.renameSync(srcPath, destPath)
        }
      }
      // Clean up empty src/ folder in dist
      const distSrc = resolve(__dirname, 'dist/src')
      if (fs.existsSync(distSrc)) {
        fs.rmSync(distSrc, { recursive: true, force: true })
      }
    },
  }
}

function datoPluginsDevServer(plugins: string[]): PluginOption {
  return {
    name: 'dato-plugins-dev-server',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next()

        for (const plugin of plugins) {
          const basePath = `/${plugin}`

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

function createBuildInputs(plugins: string[]) {
  return plugins.reduce<Record<string, string>>((inputs, plugin) => {
    inputs[plugin] = resolve(__dirname, `src/plugins/${plugin}/index.html`)
    return inputs
  }, {})
}

export default defineConfig({
  plugins: [react(), datoPluginsDevServer(PLUGINS), relocateHtmlOutputs(PLUGINS)],
  build: {
    rollupOptions: {
      input: createBuildInputs(PLUGINS),
    },
  },
})
