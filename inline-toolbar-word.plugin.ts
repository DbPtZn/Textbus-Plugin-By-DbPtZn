/* eslint-disable prettier/prettier */
import {
  Injector,
  // makeError,
  NativeSelectionBridge,
  Selection,
  Slot,
  Subscription,
  Plugin
} from '@textbus/core'
import { createElement, createTextNode } from '@textbus/browser'
import { Layout, Tool } from '@textbus/editor'
import { auditTime, fromEvent, throttleTime } from '@tanbo/stream'

// const toolbarErrorFn = makeError('Toolbar')

export interface ToolFactory {
  (): Tool
}

export class InlineToolbarPlugin implements Plugin {
  private toolbarRef!: HTMLElement
  private toolWrapper!: HTMLElement
  private subsA: Subscription[] = []
  private subsB: Subscription[] = []
  private subsC: Subscription[] = []
  private tools: Array<Tool | Tool[]>
  constructor(private toolFactories: Array<ToolFactory | ToolFactory[]> = []) {
    this.tools = toolFactories.map((i) => {
      return Array.isArray(i) ? i.map((j) => j()) : i()
    })
  }
  setup(injector: Injector) {
    const selection = injector.get(Selection)
    const layout = injector.get(Layout)
    const nativeSelectionBridge = injector.get(NativeSelectionBridge)
    const container = layout.container
    this.toolbarRef = createElement('div', {
      classes: ['textbus-fast-toolbar'],
      styles: {
        borderRadius: '3px',
        position: 'absolute',
        fontSize: '12px',
        padding: '1px 0',
        textAlign: 'center',
        marginLeft: '-23px',
        marginTop: '-30px',
        backgroundColor: 'rgb(255, 255, 255)',
        boxShadow: '0 1px 2px rgba(0,0,0,.3)',
        textDecoration: 'none'
      },
      children: [
        (this.toolWrapper = createElement('div', {
          classes: ['textbus-fast-toolbar-wrapper']
        }))
        // this.keymapPrompt = createElement('div', {
        //     classes: ['textbus-toolbar-keymap-prompt'] //键映射提示 无实现
        // })
      ]
    })
    this.tools.forEach((tool) => {
      const group = document.createElement('div')
      group.classList.add('textbus-fast-toolbar-group')
      group.style.display = 'inline-block'
      this.toolWrapper.appendChild(group)
      // 如果是数组
      if (Array.isArray(tool)) {
        tool.forEach((t) => {
          group.appendChild(t.setup(injector, this.toolWrapper))
        })
        return
      }
      group.appendChild(tool.setup(injector, this.toolWrapper))
    })

    this.subsA.push(
      selection.onChange.subscribe(() => {
        // 当选区发生变化时，如果有工具条存在，先销毁
        if (this.toolbarRef.parentNode) {
          console.log('销毁')
          this.toolbarRef.parentNode.removeChild(this.toolbarRef)
          this.subsC.forEach((i: any) => {i.unsubscribe()})
        }
        // 防止启动多个监听事件
        if (this.subsB.length === 0) {
          this.subsB.push(
            fromEvent(container, 'mouseup').subscribe((e: any) => {
              const { clientX, clientY } = e
              const mouse = { clientX, clientY }
              this.onSelectionChange(document, selection, nativeSelectionBridge, container, mouse)
            })
          )
        }
      })
    )
  }
  onDestroy() {
    this.subsA.forEach((i) => i.unsubscribe())
    this.subsB.forEach((i) => i.unsubscribe())
    this.subsC.forEach((i) => i.unsubscribe())
    console.log('行内工具条销毁')
  }
  private onSelectionChange(
    document: Document,
    selection: Selection,
    bridge: NativeSelectionBridge,
    container: HTMLElement,
    mouse: { clientX: number; clientY: number }
  ) {
    const scroller = container.parentNode?.parentNode as HTMLDivElement
    const nativeSelection = <globalThis.Selection>document.getSelection()
    const firstNativeRange = nativeSelection.rangeCount ? nativeSelection.getRangeAt(0) : null
    if (!nativeSelection.isCollapsed) {
      if (firstNativeRange) {
        const focusNode = firstNativeRange.commonAncestorContainer
        // 双击编辑区中的空白区域也会展开行内工具栏，经研究此时的行内工具栏符合一下特征（应该是选到了上下两行的中间），排除即可
        if(focusNode.nodeName === 'DIV' && firstNativeRange.endContainer.nodeName === 'P' && firstNativeRange.endOffset === 0) return
        if (focusNode) {
          const node = focusNode.nodeType === Node.TEXT_NODE ? focusNode.parentNode : focusNode
          if (node) {
            if (!this.toolbarRef.parentNode) {
              /** 从光标所在的位置展开行内工具栏 */
              Object.assign(this.toolbarRef.style, {
                left: mouse.clientX - container.offsetLeft + 'px',
                top: mouse.clientY + scroller.scrollTop - container.offsetTop + 'px'
              })
              container.appendChild(this.toolbarRef)
              this.subsC.push(
                /** 实现效果：鼠标远离行内工具栏时，工具栏会逐渐透明直至销毁 */
                fromEvent(container, 'mousemove')
                  .pipe(throttleTime(150))
                  .subscribe((e: any) => {
                    if (this.toolbarRef.querySelector('.textbus-toolbar-dropdown-open') ||
                    this.toolbarRef.querySelector('.custom-editor-toolbar-menu-open')) {
                      // 此处应包括实际行内工具栏中可能出现的二级菜单的类名标识
                      return
                    }
                    // toolbar 相对于 container 的位置 （ top 和 bottom 受 container 位置 以及 滚动高度影响 ）
                    const toolbarTop = this.toolbarRef.offsetTop - scroller.scrollTop
                    const toolbarBottom = this.toolbarRef.offsetTop + this.toolbarRef.offsetHeight - scroller.scrollTop
                    const toolbarLeft = this.toolbarRef.offsetLeft
                    const toolbarRight = this.toolbarRef.offsetLeft + this.toolbarRef.offsetWidth - scroller.scrollLeft
                    // 光标在 container 中的高度位置（受 container 位置影响但不受滚动高度影响）（e.clientY 是光标窗口中实际位置）
                    const cursorY = e.clientY - container.offsetTop 
                    const cursorX = e.clientX - container.offsetLeft
                    const distanceY = () => {
                      if (cursorY > toolbarBottom) return -(toolbarBottom - cursorY) / 100
                      else if (cursorY < toolbarTop) return (toolbarTop - cursorY) / 100
                      else return 0
                    }
                    const distanceX = () => {
                      if (cursorX > toolbarRight) return -(toolbarRight - cursorX) / 100
                      else if (cursorX < toolbarLeft) return (toolbarLeft - cursorX) / 100
                      else return 0
                    }
                    // c^2 = a^2 + b^2
                    this.toolbarRef.style.opacity = (1 - Math.sqrt(distanceY() ** 2 + distanceX() ** 2)).toString()
                    if (distanceY() > 1 || distanceX() > 1) this.clearInlineToolbar()
                  }),
                /** 鼠标离开 container 时，行内工具栏销毁 */
                fromEvent(container, 'mouseleave').subscribe(() => {
                  this.clearInlineToolbar()
                }),
                /** 滚动时，行内工具栏销毁 */
                fromEvent(scroller, 'scroll').subscribe(() => {
                  this.clearInlineToolbar()
                })
              )
            } 
            // return
          }
        }
      }
    } else {
      this.clearInlineToolbar()
    }
  }
  private clearInlineToolbar() {
    if (this.toolbarRef.parentNode) this.toolbarRef.parentNode.removeChild(this.toolbarRef)
    this.subsC.forEach((i: any) => {i.unsubscribe()})
    this.subsB.forEach((i: any) => {i.unsubscribe()})
    this.subsB = []
  }
}

  /** 从选取结束的位置展开行内工具栏 */
  // const rect = <any>bridge.getRect({
  //   // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //   slot: <Slot<any>>selection.startSlot,
  //   offset: <number>selection.startOffset
  // })
  // const offsetRect = container.getBoundingClientRect()
  // Object.assign(this.toolbarRef.style, {
  //   left: rect.left - offsetRect.left + 'px',
  //   top: rect.top - offsetRect.top + 'px'
  // })
  //  弹出工具栏居中
  // const rect2 = <RangePosition>bridge.getRect({
  //   slot: <Slot<any>>selection.endSlot,
  //   offset: <number>selection.endOffset
  // })
  // Object.assign(this.toolbarRef.style, {
  //   left: (rect.left + rect2.left) / 2 - offsetRect.left + 'px',
  //   top: rect.top - offsetRect.top + 'px'
  // })