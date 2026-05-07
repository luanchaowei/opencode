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
            
            // Parse multipart/form-data properly for binary files
            const boundaryBuffer = Buffer.from(`--${boundary}`)
            let fileContent = null
            let filePath = null
            
            // Find file and path parts
            const boundaryPositions = []
            let pos = 0
            while (pos < buffer.length) {
              const idx = buffer.indexOf(boundaryBuffer, pos)
              if (idx === -1) break
              boundaryPositions.push(idx)
              pos = idx + boundaryBuffer.length
            }
            
            for (let i = 0; i < boundaryPositions.length - 1; i++) {
              const start = boundaryPositions[i] + boundaryBuffer.length
              const end = boundaryPositions[i + 1]
              const part = buffer.slice(start, end)
              
              // Check if this is the file part
              const nameMatch = part.indexOf(Buffer.from('name="file"'))
              if (nameMatch !== -1) {
                // Find header end (after \r\n\r\n)
                const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
                if (headerEnd !== -1) {
                  // File content is between header end and the trailing \r\n before next boundary
                  const contentStart = headerEnd + 4
                  const contentEnd = part.length - 2 // Remove trailing \r\n
                  fileContent = part.slice(contentStart, contentEnd)
                }
              }
              
              // Check if this is the path part
              const pathMatch = part.indexOf(Buffer.from('name="path"'))
              if (pathMatch !== -1) {
                const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
                if (headerEnd !== -1) {
                  const contentStart = headerEnd + 4
                  const contentEnd = part.length - 2
                  filePath = part.slice(contentStart, contentEnd).toString().trim()
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
            
            writeFileSync(fullPath, fileContent)
            
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
