import { createSignal, createResource, For, Show, Suspense } from "solid-js"
import { useLanguage } from "@/context/language"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Button } from "@opencode-ai/ui/button"

export function CaseLibraryDialog() {
  const language = useLanguage()
  const [currentPath, setCurrentPath] = createSignal("")
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null)
  
  const [items] = createResource(currentPath, async (path) => {
    try {
      const url = path ? `/api/case-library/list?path=${encodeURIComponent(path)}` : "/api/case-library/list"
      const res = await fetch(url)
      if (!res.ok) return { files: [], dirs: [] }
      return await res.json()
    } catch {
      return { files: [], dirs: [] }
    }
  })
  
  const [content] = createResource(selectedFile, async (filePath) => {
    if (!filePath) return ""
    try {
      const res = await fetch(`/api/case-library/read?path=${encodeURIComponent(filePath)}`)
      if (!res.ok) return ""
      const data = await res.json()
      return data.content || ""
    } catch {
      return ""
    }
  })
  
  const goToParent = () => {
    const path = currentPath()
    if (!path) return
    const parts = path.split("/")
    parts.pop()
    setCurrentPath(parts.join("/"))
    setSelectedFile(null)
  }
  
  const enterDir = (dirName: string) => {
    const path = currentPath()
    setCurrentPath(path ? `${path}/${dirName}` : dirName)
    setSelectedFile(null)
  }
  
  const selectFile = (fileName: string) => {
    const path = currentPath()
    setSelectedFile(path ? `${path}/${fileName}` : fileName)
  }
  
  const getDisplayName = (name: string) => {
    return name.length > 30 ? name.substring(0, 27) + "..." : name
  }
  
  return (
    <Dialog title={language.t("enterprise.caseLibrary")} size="large" draggable fullscreen>
      <div class="flex gap-4 flex-1 min-h-0">
        <div class="w-1/3 border-r border-border-weak-base flex flex-col min-h-0">
          <div class="flex items-center gap-2 px-2 py-1 border-b border-border-weak-base min-h-[36px] shrink-0">
            <Show when={currentPath()}>
              <Button variant="ghost" size="small" class="h-6 w-6 p-0" onClick={goToParent}>
                <Icon name="arrow-left" size="small" />
              </Button>
              <span class="text-11-regular text-text-weak truncate flex-1">{currentPath()}</span>
            </Show>
            <Show when={!currentPath()}>
              <span class="text-11-regular text-text-weak">案例库根目录</span>
            </Show>
          </div>
          <div class="flex-1 overflow-y-auto p-2 min-h-0">
            <Suspense fallback={<Spinner />}>
              <Show when={items()?.dirs?.length === 0 && items()?.files?.length === 0}>
                <div class="text-12-regular text-text-weak">暂无内容</div>
              </Show>
              <For each={items()?.dirs || []}>
                {(dir: { name: string; path: string }) => (
                  <div
                    class="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-surface-raised-base rounded text-12-regular"
                    onClick={() => enterDir(dir.name)}
                  >
                    <Icon name="folder" size="small" class="text-icon-weak" />
                    <span class="truncate">{getDisplayName(dir.name)}</span>
                  </div>
                )}
              </For>
              <For each={items()?.files || []}>
                {(file: { name: string; path: string }) => (
                  <div
                    class="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-surface-raised-base rounded text-12-regular"
                    classList={{ "bg-surface-raised-base": selectedFile() === file.path }}
                    onClick={() => selectFile(file.name)}
                  >
                    <Icon name="code" size="small" class="text-icon-weak" />
                    <span class="truncate">{getDisplayName(file.name)}</span>
                  </div>
                )}
              </For>
            </Suspense>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-2 min-h-0">
          <Show when={!selectedFile()}>
            <div class="flex items-center justify-center h-full text-12-regular text-text-weak">
              {language.t("enterprise.selectFileToView")}
            </div>
          </Show>
          <Show when={selectedFile()}>
            <Suspense fallback={<Spinner />}>
              <div class="text-12-medium mb-2 text-text-base">{selectedFile()}</div>
              <pre class="text-12-regular whitespace-pre-wrap bg-surface-panel p-3 rounded border border-border-weak-base overflow-auto flex-1 min-h-0">
                {content()}
              </pre>
            </Suspense>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}