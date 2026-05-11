import { createSimpleContext } from "@opencode-ai/ui/context"
import { createResource } from "solid-js"
import { getFilename } from "@opencode-ai/core/util/path"

export const { use: useDevice, provider: DeviceProvider } = createSimpleContext({
  name: "Device",
  init: () => {
    const [clientIP] = createResource(async () => {
      try {
        const response = await fetch('/device/info')
        if (response.ok) {
          const { clientIP } = await response.json()
          return clientIP
        }
      } catch (error) {
        console.error('Failed to get device info:', error)
      }
      return null
    })

    const isOwnProject = (projectWorktree: string): boolean => {
      const ip = clientIP()
      if (ip === undefined || ip === null) return true
      if (ip === 'localhost' || ip === 'unknown') return true
      const dirName = getFilename(projectWorktree)
      return dirName === ip
    }

    return {
      clientIP,
      isOwnProject,
    }
  },
})