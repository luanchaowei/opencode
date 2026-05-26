import { createSimpleContext } from "@opencode-ai/ui/context"
import { createResource } from "solid-js"
import { getFilename } from "@opencode-ai/core/util/path"

export const { use: useDevice, provider: DeviceProvider } = createSimpleContext({
  name: "Device",
  init: () => {
    const [deviceInfo] = createResource(async () => {
      try {
        const response = await fetch('/device/info')
        if (response.ok) {
          const { clientIP, contactAdmin } = await response.json()
          return { clientIP, contactAdmin }
        }
      } catch (error) {
        console.error('Failed to get device info:', error)
      }
      return { clientIP: null, contactAdmin: [] }
    })

    const clientIP = () => deviceInfo()?.clientIP
    const contactAdmin = () => deviceInfo()?.contactAdmin ?? []

    const isOwnProject = (projectWorktree: string): boolean => {
      const ip = clientIP()
      if (ip === undefined || ip === null) return true
      if (ip === 'localhost' || ip === 'unknown') return true
      const dirName = getFilename(projectWorktree)
      return dirName === ip
    }

    return {
      clientIP,
      contactAdmin,
      isOwnProject,
    }
  },
})