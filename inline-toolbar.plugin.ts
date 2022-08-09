import { Injector, makeError, NativeSelectionBridge, RangeViewPosition, Renderer, Selection, Slot, Subscription, Plugin  } from '@textbus/core'
import { createElement, createTextNode } from '@textbus/browser'
import { Layout, Tool } from '@textbus/editor'
import { auditTime, fromEvent } from '@tanbo/stream'


const toolbarErrorFn = makeError('Toolbar')

export interface ToolFactory {
    (): Tool
}

export class InlineToolbarPlugin implements Plugin {
    private elementRef!: HTMLElement
    private toolWrapper!: HTMLElement
    private style!: HTMLElement

    private subs: Subscription[] = []
    private tools: Array<Tool | Tool[]>

    
    constructor(private toolFactories: Array<ToolFactory | ToolFactory[]> = []) {
        this.tools = toolFactories.map(i => {
            return Array.isArray(i) ? i.map(j => j()) : i()
        });
    }

    setup(injector:Injector) {

        const selection = injector.get(Selection)
        const layout = injector.get(Layout)
        const renderer = injector.get(Renderer)
        const nativeSelectionBridge = injector.get(NativeSelectionBridge)
        const container = layout.container;
        
        this.elementRef = createElement('div', {
            classes: ['textbus-fast-toolbar'],
            children: [
                this.toolWrapper = createElement('div', {
                    classes: ['textbus-fast-toolbar-wrapper']
                }),
                // this.keymapPrompt = createElement('div', {
                //     classes: ['textbus-toolbar-keymap-prompt'] //键映射提示 未实现
                // })
            ]
        });

        this.tools.forEach(tool => {
            const group = document.createElement('div')
            group.classList.add('textbus-fast-toolbar-group')
            this.toolWrapper.appendChild(group);
            if (Array.isArray(tool)) {
                tool.forEach(t => {
                    group.appendChild(t.setup(injector, this.toolWrapper))
                });
                return;
            }
            group.appendChild(tool.setup(injector, this.toolWrapper))
        });

        this.subs.push(selection.onChange.pipe(auditTime(300)).subscribe(() => {
            fromEvent(container,'mouseup').subscribe(()=>{
                this.onSelectionChange(document, selection, nativeSelectionBridge, container, renderer)
            })
        }));


        /** CSS */
        this.style = createElement('style', {
            children:[
                createTextNode(`
                    .textbus-fast-toolbar{
                        border-radius:3px;
                        position:absolute;
                        font-size:12px;
                        padding:1px 0;
                        // width:200px;
                        text-align:center;
                        margin-left:-23px;
                        margin-top:-30px;
                        background-color:rgb(255, 255, 255);
                        color:#ddd;
                        box-shadow:0 1px 2px rgba(0,0,0,.3);
                        text-decoration:none
                    }
                    
                    .textbus-fast-toolbar-group{
                        display: inline-block;
                    }
                `)
            ]
        })
        document.querySelector('head')?.appendChild(this.style)
    }

    onDestroy() {
        this.subs.forEach((i:any) => i.unsubscribe())
    }

    private onSelectionChange(document: Document, selection: Selection, bridge: NativeSelectionBridge, container: HTMLElement,renderer:Renderer) {

        const nativeSelection = <globalThis.Selection>document.getSelection()
        const firstNativeRange = nativeSelection.rangeCount ? nativeSelection.getRangeAt(0) : null

        if(!nativeSelection.isCollapsed){
            if(firstNativeRange){
                const focusNode = firstNativeRange.commonAncestorContainer;
                if (focusNode){
                    const node = (focusNode.nodeType === Node.TEXT_NODE ? focusNode.parentNode : focusNode);
                    if(node){
                        const rect = <RangeViewPosition>bridge.getRect({
                            slot: <Slot<any>>selection.startSlot,
                            offset: <number>selection.startOffset
                        });
                        const offsetRect = container.getBoundingClientRect();
                        Object.assign(this.elementRef.style, {
                            left: rect.left - offsetRect.left + 'px',
                            top: rect.top - offsetRect.top + 'px'
                        });
                        /*       //  弹出工具栏居中
                        const rect2 = <RangePosition>bridge.getRect({
                            slot: <Slot<any>>selection.endSlot,
                            offset: <number>selection.endOffset
                        });
                        Object.assign(this.elementRef.style, {
                            left: (rect.left + rect2.left) / 2 - offsetRect.left + 'px',
                            top: rect.top - offsetRect.top + 'px'
                        });
                        // */
                        if (!this.elementRef.parentNode) {
                            container.appendChild(this.elementRef)
                        }
                        return
                    }
                }
            }
        }else{
            this.elementRef.parentNode?.removeChild(this.elementRef)
        }
    }
}

/** 用法说明： */
/*
plugins: [
    () => new InlineToolbarPlugin([
      [defaultGroupTool],
      [headingTool],
      [boldTool, italicTool, strikeThroughTool, underlineTool],
      [colorTool, textBackgroundTool],
      [linkTool, unlinkTool],
      [imageTool],
      [cleanTool],
      ...
    ])
]
*/