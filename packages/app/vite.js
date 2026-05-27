import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, statSync, readdirSync, rmdirSync } from "node:fs"
import { dirname, join } from "node:path"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))

function getClientIP(req) {
  // 如果有代理，从 x-forwarded-for 获取
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim()
    // 去掉冒号（IPv6），点号改为下划线（IPv4）
    return ip.replace(/:/g, '').replace(/\./g, '_')
  }
  
  // 直连时从 socket 获取
  const remoteAddress = req.socket?.remoteAddress
  if (remoteAddress) {
    // 处理 IPv6 映射的 IPv4 地址 (::ffff:192.168.1.1)
    if (remoteAddress.startsWith('::ffff:')) {
      const ipv4 = remoteAddress.substring(7)  // 提取 IPv4 部分
      return ipv4.replace(/\./g, '_')  // 点号改为下划线
    }
    // 本地回环地址统一为 localhost
    if (remoteAddress === '::1' || remoteAddress === '127.0.0.1') {
      return 'localhost'
    }
    // 去掉冒号（IPv6），点号改为下划线（IPv4）
    return remoteAddress.replace(/:/g, '').replace(/\./g, '_')
  }
  
  return 'unknown'
}

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
    name: "opencode-desktop:device-info-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith("/device/info") && req.method === "GET") {
          try {
            const clientIP = getClientIP(req)
            const contactAdmin = process.env.VITE_CONTACT_ADMIN || ""
            const contactList = contactAdmin.split('|').filter(line => line.trim())
            const feedbackUrl = process.env.VITE_FEEDBACK_URL || ""
            const caseLibraryDir = process.env.VITE_CASE_LIBRARY_DIR || ""
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ clientIP, contactAdmin: contactList, feedbackUrl, caseLibraryDir }))
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
    name: "opencode-desktop:directory-create-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith("/directory/create") && req.method === "POST") {
          try {
            const chunks = []
            for await (const chunk of req) {
              chunks.push(chunk)
            }
            const body = JSON.parse(Buffer.concat(chunks).toString())
            const { path: targetPath } = body
            
            if (!targetPath) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Missing path" }))
              return
            }
            
            if (!existsSync(targetPath)) {
              mkdirSync(targetPath, { recursive: true })
            }
            
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ success: true, path: targetPath }))
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
    name: "opencode-desktop:case-library-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith("/api/case-library/list") && req.method === "GET") {
          try {
            const caseLibraryDir = process.env.VITE_CASE_LIBRARY_DIR || ""
            res.setHeader("Content-Type", "application/json")
            if (!caseLibraryDir || !existsSync(caseLibraryDir)) {
              res.end(JSON.stringify({ files: [] }))
              return
            }
            
            const urlObj = new URL(req.url, `http://${req.headers.host}`)
            const subPath = urlObj.searchParams.get("path") || ""
            const targetDir = subPath ? join(caseLibraryDir, subPath) : caseLibraryDir
            
            if (!existsSync(targetDir)) {
              res.end(JSON.stringify({ files: [], dirs: [] }))
              return
            }
            
            const files = []
            const dirs = []
            const entries = readdirSync(targetDir, { withFileTypes: true })
            for (const entry of entries) {
              if (entry.isDirectory()) {
                dirs.push({ name: entry.name, path: subPath ? `${subPath}/${entry.name}` : entry.name })
              } else if (entry.isFile()) {
                files.push({ name: entry.name, path: subPath ? `${subPath}/${entry.name}` : entry.name })
              }
            }
            
            res.end(JSON.stringify({ files, dirs }))
          } catch (error) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: error.message }))
          }
        } else if (req.url?.startsWith("/api/case-library/read") && req.method === "GET") {
          try {
            const caseLibraryDir = process.env.VITE_CASE_LIBRARY_DIR || ""
            res.setHeader("Content-Type", "application/json")
            if (!caseLibraryDir) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Case library not configured" }))
              return
            }
            
            const urlObj = new URL(req.url, `http://${req.headers.host}`)
            const filePath = urlObj.searchParams.get("path")
            if (!filePath) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Missing path" }))
              return
            }
            
            const fullPath = join(caseLibraryDir, filePath)
            if (!existsSync(fullPath)) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: "File not found" }))
              return
            }
            
            const content = readFileSync(fullPath, "utf-8")
            res.end(JSON.stringify({ content }))
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
    name: "opencode-desktop:file-download-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith("/file/download") && req.method === "GET") {
          try {
            const query = new URL(req.url, "http://localhost").searchParams
            const filePath = query.get("path")
            const directory = query.get("directory")
            
            if (!filePath) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Missing path" }))
              return
            }
            
            if (!directory) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Missing directory" }))
              return
            }
            
            const fullPath = filePath.startsWith("/") ? filePath : join(directory, filePath)
            
            if (!existsSync(fullPath)) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: "File not found" }))
              return
            }
            
            const stats = statSync(fullPath)
            if (stats.isDirectory()) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Path is a directory, not a file" }))
              return
            }
            
            const fileContent = readFileSync(fullPath)
            const filename = filePath.split("/").pop() || "download"
            
            res.setHeader("Content-Type", "application/octet-stream")
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
            res.setHeader("Content-Length", fileContent.length)
            res.end(fileContent)
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
    name: "opencode-desktop:file-delete-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith("/file/delete") && req.method === "POST") {
          try {
            const chunks = []
            for await (const chunk of req) {
              chunks.push(chunk)
            }
            const body = JSON.parse(Buffer.concat(chunks).toString())
            const { path: filePath } = body
            
            if (!filePath) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: "Missing path" }))
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
            
            if (!existsSync(fullPath)) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: "File not found" }))
              return
            }
            
            const stats = statSync(fullPath)
            
            if (stats.isDirectory()) {
              // Recursively delete directory
              const deleteDir = (dirPath) => {
                const entries = readdirSync(dirPath, { withFileTypes: true })
                for (const entry of entries) {
                  const fullPath = join(dirPath, entry.name)
                  if (entry.isDirectory()) {
                    deleteDir(fullPath)
                  } else {
                    unlinkSync(fullPath)
                  }
                }
                rmdirSync(dirPath)
              }
              deleteDir(fullPath)
            } else {
              unlinkSync(fullPath)
            }
            
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ success: true }))
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