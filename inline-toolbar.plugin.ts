/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable prettier/prettier */
import {
  Injector,
  makeError,
  NativeSelectionBridge,
  Renderer,
  Selection,
  Slot,
  Subscription,
  Plugin
} from '@textbus/core'
import { createElement, createTextNode } from '@textbus/browser'
import { Layout, Tool } from '@textbus/editor'
import { auditTime, fromEvent } from '@tanbo/stream'

const toolbarErrorFn = makeError('Toolbar')

export interface ToolFactory {
  (): Tool
}

export class InlineToolbarPlugin implements Plugin {
  private toolbarRef!: HTMLElement
  private toolWrapper!: HTMLElement
  private subsA: Subscription[] = []
  private subsB: Subscription[] = []
  private tools: Array<Tool | Tool[]>

  constructor(private toolFactories: Array<ToolFactory | ToolFactory[]> = []) {
    this.tools = toolFactories.map((i) => {
      return Array.isArray(i) ? i.map((j) => j()) : i()
    })
  }

  setup(injector: Injector) {
    const selection = injector.get(Selection)
    const layout = injector.get(Layout)
    const renderer = injector.get(Renderer)
    const nativeSelectionBridge = injector.get(NativeSelectionBridge) // 本地选区桥梁 ？
    console.log(nativeSelectionBridge)
    const container = layout.container

    this.toolbarRef = createElement('div', {
      classes: ['textbus-fast-toolbar'],
      children: [
        (this.toolWrapper = createElement('div', {
          classes: ['textbus-fast-toolbar-wrapper']
        }))
        // this.keymapPrompt = createElement('div', {
        //     classes: ['textbus-toolbar-keymap-prompt'] //键映射提示 未实现
        // })
      ]
    })

    this.tools.forEach((tool) => {
      const group = document.createElement('div')
      group.classList.add('textbus-fast-toolbar-group')
      group.style.display = 'inline-block'
      this.toolWrapper.appendChild(group)
      if (Array.isArray(tool)) {
        tool.forEach((t) => {
          group.appendChild(t.setup(injector, this.toolWrapper))
        })
        return
      }
      group.appendChild(tool.setup(injector, this.toolWrapper))
    })

    this.subsA.push(
      selection.onChange.pipe(auditTime(300)).subscribe(() => {
        // console.log(selection)
        // 阻止创建多个事件监听器
        if (this.subsB.length === 0) {
          this.subsB.push(
            fromEvent(container, 'mouseup').subscribe(() => {
              this.onSelectionChange(
                document,
                selection,
                nativeSelectionBridge,
                container,
                renderer
              )
            })
          )
        }
      })
    )
  }

  onDestroy() {
    this.subsA.forEach((i: any) => i.unsubscribe())
    this.subsB.forEach((i: any) => i.unsubscribe())
  }

  private onSelectionChange(
    document: Document,
    selection: Selection,
    bridge: NativeSelectionBridge,
    container: HTMLElement,
    renderer: Renderer
  ) {
    // 选区对象
    const nativeSelection = <globalThis.Selection>document.getSelection()
    // 选区范围
    const firstNativeRange = nativeSelection.rangeCount ? nativeSelection.getRangeAt(0) : null
    // 选区闭合状态 （选中内容时为 false）
    if (!nativeSelection.isCollapsed) {
      if (firstNativeRange) {
        // 简单理解是选区所有节点中，最外层节点的父级（不完全准确）
        const focusNode = firstNativeRange.commonAncestorContainer
        // console.log(firstNativeRange.commonAncestorContainer)
        if (focusNode) {
          // 简单理解就是： 如果 focusNode 是 text 纯文本，那么就获取其所在的标签块，即 parentNode
          const node = focusNode.nodeType === Node.TEXT_NODE ? focusNode.parentNode : focusNode
          if (node) {
            // 获取原生选区的坐标位置
            const rect = bridge.getRect({
              slot: selection.startSlot!,
              offset: selection.startOffset!
            })!
            // 获取元素的矩形坐标信息
            /** container */
            const containerRect = container.getBoundingClientRect()
            const containerLeft = containerRect.left
            const containerTop = containerRect.top
            const containerRight = containerRect.right
            /** toolbar */
            const toolbarTop = rect.top // 工具条顶部坐标
            let toolbarLeft = rect.left // 工具条左侧坐标
            const toolbarWidth = 520    // 工具条宽度
            const toolbarRight = toolbarLeft + toolbarWidth   // 工具条右侧坐标
            this.toolbarRef.style.width = `${toolbarWidth}px` // 设置工具条宽度
            const coe = 23 // 工具条X轴位置修正系数
            // 当工具条右侧坐标 > 编辑区右侧坐标
            if (toolbarRight > containerRight) {
              // 计算工具条溢出多少
              const offsetValue = toolbarRight  - containerRight
              // 修正工具栏左侧坐标
              toolbarLeft = toolbarLeft - offsetValue + coe
            }
            // rect 的坐标是相对于 body，而 toolbarRef 的坐标是相对于 container，所以实际设置坐标时应减去 container 的偏移 
            Object.assign(this.toolbarRef.style, {
              left: toolbarLeft - containerLeft  - coe + 'px',
              top: toolbarTop - containerTop + 'px',
            })
            if (!this.toolbarRef.parentNode) {
              container.appendChild(this.toolbarRef)
            }
            return
          }
        }
      }
    } else {
      this.toolbarRef.parentNode?.removeChild(this.toolbarRef)
    }
  }
}