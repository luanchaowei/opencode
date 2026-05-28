import { createSignal, createResource, For, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Button } from "@opencode-ai/ui/button"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { marked } from "marked"

const DEFAULT_SIDEBAR_WIDTH = 300

export function CaseLibraryDialog() {
  const language = useLanguage()
  const [currentPath, setCurrentPath] = createSignal("")
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null)
  const [store, setStore] = createStore({
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  })
  
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
    if (!filePath) return { html: "", isMarkdown: false }
    try {
      const res = await fetch(`/api/case-library/read?path=${encodeURIComponent(filePath)}`)
      if (!res.ok) return { html: "", isMarkdown: false }
      const data = await res.json()
      const text = data.content || ""
      const isMarkdown = filePath.toLowerCase().endsWith(".md")
      const html = isMarkdown ? await marked.parse(text) : text
      return { html, isMarkdown }
    } catch {
      return { html: "", isMarkdown: false }
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
      <div class="relative flex gap-0 flex-1 min-h-0">
        <div 
          class="border-r border-border-weak-base flex flex-col min-h-0 shrink-0 relative"
          style={{ width: `${store.sidebarWidth}px` }}
        >
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
          <ResizeHandle
            direction="horizontal"
            edge="end"
            size={store.sidebarWidth}
            min={200}
            max={500}
            onResize={(width) => {
              setStore("sidebarWidth", width)
            }}
          />
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
              <Show when={content()?.isMarkdown}>
                <div 
                  data-component="markdown"
                  class="flex-1 min-h-0 overflow-auto bg-surface-panel p-4 rounded border border-border-weak-base"
                  innerHTML={content()?.html || ""}
                />
              </Show>
              <Show when={!content()?.isMarkdown}>
                <pre class="text-12-regular whitespace-pre-wrap bg-surface-panel p-3 rounded border border-border-weak-base overflow-auto flex-1 min-h-0">
                  {content()?.html}
                </pre>
              </Show>
            </Suspense>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}