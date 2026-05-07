import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))

/**
 * @type {import("vite").PluginOption}
 */
export default [
  {
    name: "opencode-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        worker: {
          format: "es",
        },
      }
    },
  },
  {
    name: "opencode-desktop:file-upload-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith("/file/upload") && req.method === "POST") {
          try {
            const chunks = []
            for await (const chunk of req) {
              chunks.push(chunk)
            }
            const buffer = Buffer.concat(chunks)
            
            const boundary = req.headers["content-type"]?.split("boundary=")[1]
            if (!boundary) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Missing boundary" }))
              return
            }
            
            const parts = buffer.toString().split(`--${boundary}`)
            let fileContent = null
            let filePath = null
            
            for (const part of parts) {
              if (part.includes("name=\"file\"")) {
                const headerEnd = part.indexOf("\r\n\r\n")
                if (headerEnd !== -1) {
                  fileContent = part.slice(headerEnd + 4, part.lastIndexOf("\r\n"))
                }
              } else if (part.includes("name=\"path\"")) {
                const headerEnd = part.indexOf("\r\n\r\n")
                if (headerEnd !== -1) {
                  filePath = part.slice(headerEnd + 4, part.lastIndexOf("\r\n")).trim()
                }
              }
            }
            
            if (!fileContent || !filePath) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Missing file or path" }))
              return
            }
            
            const query = new URL(req.url, "http://localhost").searchParams
            const directory = query.get("directory")
            
            if (!directory) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Missing directory" }))
              return
            }
            
            const fullPath = filePath.startsWith("/") ? filePath : join(directory, filePath)
            const dir = dirname(fullPath)
            
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true })
            }
            
            writeFileSync(fullPath, fileContent, "binary")
            
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ success: true, path: fullPath }))
          } catch (error) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: error.message }))
          }
        } else {
          next()
        }
      })
    },
  },
  {
    name: "opencode-desktop:theme-preload",
    transformIndexHtml(html) {
      return html.replace(
        '<script id="oc-theme-preload-script" src="/oc-theme-preload.js"></script>',
        `<script id="oc-theme-preload-script">${readFileSync(theme, "utf8")}</script>`,
      )
    },
  },
  tailwindcss(),
  solidPlugin(),
]
