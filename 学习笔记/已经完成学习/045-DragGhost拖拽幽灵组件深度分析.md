# DragGhost 拖拽幽灵组件深度分析

## 📋 概述

DragGhost（拖拽幽灵组件）是低代码引擎中用于在拖拽操作时提供**视觉反馈**的核心组件。当用户拖拽组件时，DragGhost 会在鼠标位置显示被拖拽组件的标题预览，增强用户的拖拽体验。

**文件位置**: `packages/designer/src/designer/drag-ghost/index.tsx`

## 🎯 核心功能

### 1. **拖拽视觉反馈**

- 跟随鼠标显示被拖拽组件的标题
- 支持多个组件同时拖拽的批量显示
- 在绝对定位容器中自动隐藏（避免视觉干扰）

### 2. **智能显示控制**

- 仅在拖拽过程中显示
- 在 HTML5 原生拖拽中自动隐藏
- 检测容器类型，在绝对布局容器中隐藏

## 🔢 X、Y 坐标计算规则详解

### **核心计算逻辑**

DragGhost 的 x, y 坐标直接来源于 Dragon 拖拽引擎提供的 **globalX** 和 **globalY**：

```typescript
// 拖拽开始时设置初始位置
this.dragon.onDragstart((e) => {
  this.x = e.globalX;  // 🔥 使用全局X坐标
  this.y = e.globalY;  // 🔥 使用全局Y坐标
});

// 拖拽过程中实时更新位置
this.dragon.onDrag((e) => {
  this.x = e.globalX;  // 🔥 实时更新X坐标
  this.y = e.globalY;  // 🔥 实时更新Y坐标
});
```

### **GlobalX/GlobalY 的计算原理**

在 `Dragon.createLocateEvent` 函数中完成坐标转换：

```typescript
const createLocateEvent = (e: MouseEvent | DragEvent): ILocateEvent => {
    const evt: any = {
        type: 'LocateEvent',
        dragObject,
        target: e.target,
        originalEvent: e,
    };

    const sourceDocument = e.view?.document;

    // 🎯 坐标计算核心逻辑
    if (!sourceDocument || sourceDocument === document) {
        // ===== 主文档事件：直接使用客户端坐标 =====
        evt.globalX = e.clientX;
        evt.globalY = e.clientY;
    } else {
        // ===== iframe 事件：需要坐标转换 =====
        let srcSim: ISimulatorHost | undefined;

        // 查找事件来源的模拟器实例
        srcSim = masterSensors.find((sim) =>
            (sim as any).contentDocument === sourceDocument
        );

        if (srcSim) {
            // 🔥 关键：通过模拟器的视口进行坐标转换
            const g = srcSim.viewport.toGlobalPoint(e);
            evt.globalX = g.clientX;  // 转换后的全局X坐标
            evt.globalY = g.clientY;  // 转换后的全局Y坐标
            evt.canvasX = e.clientX;  // iframe内的画布X坐标
            evt.canvasY = e.clientY;  // iframe内的画布Y坐标
        } else {
            // 兜底处理
            evt.globalX = e.clientX;
            evt.globalY = e.clientY;
        }
    }
    return evt;
};
```

### **坐标计算的三种情况**

#### **1. 主文档拖拽**

```text
用户在主页面（非 iframe）中拖拽
globalX = e.clientX  // 直接使用鼠标的客户端X坐标
globalY = e.clientY  // 直接使用鼠标的客户端Y坐标
```

#### **2. iframe 拖拽（设计器画布）**

```text
用户在 iframe 画布中拖拽
    ↓
查找对应的 SimulatorHost 实例
    ↓
srcSim.viewport.toGlobalPoint(e) // 坐标转换
    ↓
globalX = 转换后的全局坐标X    // 相对于主文档的坐标
globalY = 转换后的全局坐标Y    // 相对于主文档的坐标
canvasX = e.clientX           // iframe 内的坐标X
canvasY = e.clientY           // iframe 内的坐标Y
```

#### **3. 跨 iframe 拖拽**

```text
从组件库拖拽到 iframe 画布
    ↓
起始坐标：主文档坐标 (e.clientX, e.clientY)
    ↓
进入 iframe：通过 viewport.toGlobalPoint 转换
    ↓
DragGhost 始终使用 globalX/globalY 保持一致的视觉定位
```

### **viewport.toGlobalPoint 转换细节**

这个方法负责将 iframe 内的坐标转换为相对于主文档的全局坐标：

```typescript
// 伪代码示意
toGlobalPoint(e) {
    const iframeRect = iframe.getBoundingClientRect(); // iframe 在主文档中的位置
    const scrollOffset = getScrollOffset(); // 滚动偏移

    return {
        clientX: e.clientX + iframeRect.left + scrollOffset.x,
        clientY: e.clientY + iframeRect.top + scrollOffset.y
    };
}
```

### **最终渲染**

DragGhost 使用计算出的坐标进行 CSS 绝对定位：

```typescript
render() {
    return (
        <div
            className="lc-ghost-group"
            style={{
                left: this.x,    // 🔥 使用 globalX
                top: this.y,     // 🔥 使用 globalY
                position: 'fixed' // 相对于视口固定定位
            }}
        >
            {this.renderGhostGroup()}
        </div>
    );
}
```

## 🔧 dragGhostComponent 定义和传递分析

### **定义和传递链路**

`dragGhostComponent` 的完整传递链路如下：

1. **定义位置**：`packages/designer/src/designer/designer.ts` 第71行的 `DesignerProps` 接口

   ```typescript

   export interface DesignerProps {
       // ... 其他属性
       dragGhostComponent?: ComponentType<any>; // 自定义拖拽幽灵组件
   }
   ```

2. **传递到视图**：`packages/designer/src/designer/designer-view.tsx` 第123-126行

   ```typescript

   render() {
       const { dragGhostComponent } = this.props;
       const DragGhost = dragGhostComponent || BuiltinDragGhostComponent;
       // ... 渲染逻辑
   }
   ```

3. **实际调用者**：`packages/plugin-designer/src/index.tsx` 第208行的 `DesignerView` 组件

   ```typescript

   <DesignerView
       onMount={this.handleDesignerMount}
       className="lowcode-plugin-designer"
       editor={editor}
       // ❌ 当前未传递 dragGhostComponent 属性
   />
   ```

### **当前实现状况**

经过源码分析发现：

#### **1. EngineOptions 中无此配置**

`IPublicTypeEngineOptions` 接口未定义 `dragGhostComponent` 选项，无法通过 `init` 函数直接传入。

#### **2. DesignerPlugin 未传递此属性**

`DesignerPlugin` 在渲染 `DesignerView` 时没有传递 `dragGhostComponent`，导致始终使用默认的 `BuiltinDragGhostComponent`。

## 🎯 不修改源码的自定义方案

### **方案1：通过 Designer 实例动态设置（推荐）**

利用 Designer 的 `setProps` 方法动态更新 dragGhostComponent：

```typescript
import { init, project } from '@alilc/lowcode-engine';
import MyCustomDragGhost from './MyCustomDragGhost';

// 1. 初始化引擎
await init(container, options);

// 2. 等待设计器初始化完成
const designer = await project.onceGot('designer');

// 3. 动态设置自定义 DragGhost 组件
designer.setProps({
  dragGhostComponent: MyCustomDragGhost
});
```

**原理说明**：

- DesignerView 的 `shouldComponentUpdate` 会调用 `this.designer.setProps(nextProps)`
- Designer 实例支持通过 `setProps` 方法动态更新属性
- 当 `dragGhostComponent` 属性变化时会触发 DesignerView 重新渲染

### **方案2：通过插件机制实现**

创建专门的插件来管理自定义 DragGhost：

```typescript
const CustomDragGhostPlugin = (ctx, options) => {
  return {
    async init() {
      const { editor } = ctx;

      // 等待设计器就绪
      editor.onceGot('designer').then((designer) => {
        // 设置自定义 DragGhost
        designer.setProps({
          dragGhostComponent: options.component
        });
      });
    }
  };
};

// 注册和使用插件
await plugins.register(CustomDragGhostPlugin, {
  component: MyCustomDragGhost
});
```

### **方案3：通过事件监听延迟设置**

利用设计器就绪事件来设置自定义组件：

```typescript
import { init, event } from '@alilc/lowcode-engine';
import MyCustomDragGhost from './MyCustomDragGhost';

// 监听设计器就绪事件
event.on('designer.ready', (designer) => {
  designer.setProps({
    dragGhostComponent: MyCustomDragGhost
  });
});

// 初始化引擎
await init(container, options);
```

### **方案4：通过 engineConfig 全局配置**

虽然不是直接支持，但可以通过 engineConfig 存储配置：

```typescript
import { engineConfig, init } from '@alilc/lowcode-engine';
import MyCustomDragGhost from './MyCustomDragGhost';

// 1. 预先设置全局配置
engineConfig.set('customDragGhost', MyCustomDragGhost);

// 2. 初始化后应用配置
await init(container, options);

const designer = await editor.onceGot('designer');
const customDragGhost = engineConfig.get('customDragGhost');

if (customDragGhost) {
  designer.setProps({
    dragGhostComponent: customDragGhost
  });
}
```

### **完整示例：自定义 DragGhost 组件**

创建自定义的拖拽幽灵组件：

```typescript
import React, { Component } from 'react';
import { observer } from '@alilc/lowcode-editor-core';

@observer
export class CustomDragGhost extends Component<{ designer: any }> {
    render() {
        const { dragon } = this.props.designer;

        // 只在拖拽时显示
        if (!dragon.dragging) {
            return null;
        }

        return (
            <div
                className="custom-drag-ghost"
                style={{
                    position: 'fixed',
                    left: dragon.x + 10,  // 使用 dragon.x 坐标并稍微偏移
                    top: dragon.y + 10,
                    background: 'rgba(0, 100, 255, 0.9)',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transform: 'scale(0.9)',
                    transition: 'transform 0.2s ease',
                }}
            >
                🚀 自定义拖拽提示
            </div>
        );
    }
}
```

### **实际使用示例**

结合推荐的方案1进行完整的使用：

```typescript
// main.js - 引擎初始化文件
import { init, project } from '@alilc/lowcode-engine';
import { CustomDragGhost } from './CustomDragGhost';

async function initLowCodeEngine() {
  // 1. 初始化低代码引擎
  await init(document.getElementById('container'), {
    // 其他配置...
  });

  // 2. 等待设计器实例初始化完成
  const designer = await project.onceGot('designer');

  // 3. 设置自定义 DragGhost 组件
  designer.setProps({
    dragGhostComponent: CustomDragGhost
  });

  console.log('✅ 自定义 DragGhost 已应用');
}

initLowCodeEngine();
```

## 📊 总结

### **坐标计算核心要点**

1. **globalX/globalY** 是统一的全局坐标系统，由 `Dragon.createLocateEvent` 计算
2. **主文档拖拽**：直接使用 `e.clientX/clientY` 作为全局坐标
3. **iframe 拖拽**：通过 `srcSim.viewport.toGlobalPoint(e)` 进行坐标转换
4. **DragGhost 定位**：使用 `dragon.x` 和 `dragon.y` 获取实时坐标

### **自定义传递机制分析**

1. **定义链路**：`DesignerProps.dragGhostComponent` → `DesignerView.props` → `render` 方法
2. **当前缺失**：`DesignerPlugin` 未传递该属性，导致始终使用默认组件
3. **动态设置**：可通过 `Designer.setProps` 方法运行时更新

### **推荐实现方案**

- **方案1（首选）**：通过 `Designer.setProps` 动态设置，无需修改源码
- **方案2**：创建插件包装设置逻辑，提升复用性
- **方案3**：利用事件系统在设计器就绪后设置
- **方案4**：结合 `engineConfig` 进行全局配置管理

### **自定义组件要求**

- 接收 `designer` 属性以访问 `dragon` 实例
- 监听 `dragon.dragging` 状态控制显示
- 使用 `dragon.x/y` 获取实时鼠标位置
- 设置 `pointerEvents: 'none'` 避免干扰拖拽

通过深入理解 DragGhost 的实现原理和传递机制，我们可以在不修改源码的前提下实现完全自定义的拖拽视觉反馈效果。
