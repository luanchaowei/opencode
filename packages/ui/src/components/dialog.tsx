import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { ComponentProps, createEffect, createSignal, JSXElement, Match, onCleanup, ParentProps, Show, Switch } from "solid-js"
import { useI18n } from "../context/i18n"
import { IconButton } from "./icon-button"

export interface DialogProps extends ParentProps {
  title?: JSXElement
  description?: JSXElement
  action?: JSXElement
  size?: "normal" | "large" | "x-large"
  class?: ComponentProps<"div">["class"]
  classList?: ComponentProps<"div">["classList"]
  fit?: boolean
  transition?: boolean
  draggable?: boolean
}

export function Dialog(props: DialogProps) {
  const i18n = useI18n()
  const [position, setPosition] = createSignal({ x: 0, y: 0 })
  const [dragging, setDragging] = createSignal(false)
  let dragStart = { x: 0, y: 0 }

  const handleMouseDown = (e: MouseEvent) => {
    if (!props.draggable) return
    const target = e.target as HTMLElement
    const header = target.closest("[data-slot='dialog-header']")
    if (!header) return
    if (target.closest("button, [role='button'], input")) return
    
    setDragging(true)
    dragStart = {
      x: e.clientX - position().x,
      y: e.clientY - position().y,
    }
    e.preventDefault()
  }

  createEffect(() => {
    if (!dragging()) return
    
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
    
    const handleMouseUp = () => {
      setDragging(false)
    }
    
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    
    onCleanup(() => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    })
  })

  return (
    <div
      data-component="dialog"
      data-fit={props.fit ? true : undefined}
      data-size={props.size || "normal"}
      data-transition={props.transition ? true : undefined}
      data-draggable={props.draggable ? true : undefined}
    >
      <div 
        data-slot="dialog-container"
        style={props.draggable ? {
          transform: `translate(calc(-50% + ${position().x}px), calc(-50% + ${position().y}px))`,
        } : undefined}
      >
        <Kobalte.Content
          data-slot="dialog-content"
          data-no-header={!props.title && !props.action ? "" : undefined}
          classList={{
            ...props.classList,
            [props.class ?? ""]: !!props.class,
          }}
          onOpenAutoFocus={(e) => {
            const target = e.currentTarget as HTMLElement | null
            const autofocusEl = target?.querySelector("[autofocus]") as HTMLElement | null
            if (autofocusEl) {
              e.preventDefault()
              autofocusEl.focus()
            }
          }}
        >
          <Show when={props.title || props.action}>
            <div 
              data-slot="dialog-header"
              onMouseDown={handleMouseDown}
              style={props.draggable ? { cursor: "move" } : undefined}
            >
              <Show when={props.title}>
                <Kobalte.Title data-slot="dialog-title">{props.title}</Kobalte.Title>
              </Show>
              <Switch>
                <Match when={props.action}>{props.action}</Match>
                <Match when={true}>
                  <Kobalte.CloseButton
                    data-slot="dialog-close-button"
                    as={IconButton}
                    icon="close"
                    variant="ghost"
                    aria-label={i18n.t("ui.common.close")}
                  />
                </Match>
              </Switch>
            </div>
          </Show>
          <Show when={props.description}>
            <Kobalte.Description data-slot="dialog-description" style={{ "margin-left": "-4px" }}>
              {props.description}
            </Kobalte.Description>
          </Show>
          <div data-slot="dialog-body">{props.children}</div>
        </Kobalte.Content>
      </div>
    </div>
  )
}
