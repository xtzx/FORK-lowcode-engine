# BemTools 组件深度分析

## 📋 概述

**BemTools** 是低代码引擎中的核心可视化设计辅助工具集合，负责在设计模式下提供所有视觉反馈和交互辅助功能。它通过 MobX 的 `@observer` 装饰器实现响应式更新，监听设计器状态变化并实时渲染相应的辅助工具。

**主要文件位置：**

- 主组件：`packages/designer/src/builtin-simulator/bem-tools/index.tsx`
- 样式文件：`packages/designer/src/builtin-simulator/bem-tools/bem-tools.less`
- 边框样式：`packages/designer/src/builtin-simulator/bem-tools/borders.less`

## 🎯 核心功能架构

### **主容器 - BemTools 组件**

```typescript
@observer
export class BemTools extends Component<{ host: BuiltinSimulatorHost }> {
  render() {
    const { host } = this.props;
    const { designMode } = host;
    const { scrollX, scrollY, scale } = host.viewport;

    // 🚫 前置条件：仅在设计模式下渲染
    if (designMode === 'live') {
      return null;
    }

    return (
      <div
        className="lc-bem-tools"
        style={{ transform: `translate(${-scrollX * scale}px,${-scrollY * scale}px)` }}
      >
        {/* 五大核心工具组件 */}
      </div>
    );
  }
}
```

### **容器样式设计**

```less
.lc-bem-tools {
  pointer-events: none;    // 🔥 关键：不阻断鼠标事件
  position: absolute;      // 绝对定位
  top: 0;
  left: 0;
  bottom: 0;              // 占满整个画布高度
  right: 0;               // 占满整个画布宽度
  overflow: visible;      // 允许内容溢出
  z-index: 1;            // 层级控制
}
```

**设计原理：**

- **全画布覆盖**：确保所有区域的设计工具都能正确显示
- **事件穿透**：`pointer-events: none` 让鼠标事件穿透到下层组件
- **坐标转换**：通过 `transform` 处理滚动和缩放的坐标同步

## 🔧 五大核心工具组件

### **1. BorderDetecting - 悬停检测边框**

**职责：** 显示鼠标悬停时的组件边框和信息

#### **Detecting 监听机制：**

```typescript
@observer
export class BorderDetecting extends Component<{ host: BuiltinSimulatorHost }> {
  @computed get current() {
    const doc = host.currentDocument;
    return doc?.detecting.current;  // 🔍 监听检测系统的当前节点
  }

  render() {
    const { current } = this;
    const { host } = this.props;

    // 🚫 前置条件检查
    const canHover = host.designer.touchSimulator || host.isEnter;
    if (!canHover || !current || host.viewport.scrolling || host.liveEditing.editing) {
      return null;
    }

    // 特殊情况：根节点悬停 - 显示全画布区域
    if (current.contains(focusNode)) {
      const bounds = host.viewport.bounds;
      return (
        <BorderDetectingInstance
          rect={new DOMRect(0, 0, bounds.width, bounds.height)}
          // 🎨 这里产生灰色蒙层
        />
      );
    }
  }
}
```

#### **样式实现：**

```less
&&-detecting {
  z-index: 1;
  border-style: dashed;                    // 虚线边框
  background: var(--color-canvas-detecting-background, rgba(0,121,242,.04));  // 半透明背景
}
```

**触发条件：**

- 鼠标进入组件区域
- 非滚动状态
- 非实时编辑状态
- 检测功能未禁用

---

### **2. BorderSelecting - 选中状态边框**

**职责：** 显示当前选中组件的边框和操作工具栏

#### **Selecting 监听机制：**

```typescript
@observer
export class BorderSelecting extends Component<{ host: BuiltinSimulatorHost }> {
  @computed get selecting() {
    const doc = this.host.currentDocument;
    const { selection } = doc;
    // 🎯 监听选择系统状态变化
    return this.dragging ? selection.getTopNodes() : selection.getNodes();
  }

  get dragging() {
    return this.host.designer.dragon.dragging;  // 🐉 监听拖拽状态
  }
}
```

#### **工具栏系统：**

```typescript
class Toolbar extends Component<{ observed: OffsetObserver }> {
  render() {
    const { node } = observed;
    const actions: ReactNodeArray = [];

    // 🔧 动态生成操作按钮
    node.componentMeta.availableActions.forEach((action) => {
      const { important = true, condition, content, name } = action;
      if (important && condition !== false) {
        actions.push(createAction(content, name, node));
      }
    });

    return (
      <div className="lc-borders-actions" style={style}>
        {actions}
        <NodeSelector node={node} />  {/* 节点选择器 */}
      </div>
    );
  }
}
```

#### **Selecting 样式实现：**

```less
&&-selecting {
  z-index: 2;              // 高于检测边框
  border-width: 2px;       // 实线边框，更粗

  &.dragging {
    background: var(--color-layer-mask-background, rgba(182, 178, 178, 0.8));
    border: none;          // 拖拽时移除边框
  }
}
```

**事件发射：**

```typescript
// 操作按钮点击时发射事件
editor?.eventBus.emit('designer.border.action', {
  name: key,
  selected: componentName,
});
```

---

### **3. InsertionView - 插入位置指示器**

**职责：** 在拖拽过程中显示可插入位置的视觉提示

#### **Insertion 监听机制：**

```typescript
@observer
export class InsertionView extends Component<{ host: BuiltinSimulatorHost }> {
  render() {
    const { host } = this.props;
    const loc = host.currentDocument?.dropLocation;  // 🎯 监听拖拽位置

    if (!loc) return null;

    // 🚫 绝对定位容器不显示插入标记
    if (loc.target?.componentMeta?.advanced.isAbsoluteLayoutContainer) {
      return null;
    }
  }
}
```

#### **插入类型处理：**

```typescript
// 🎨 三种插入类型的样式计算
if (insertType === 'cover') {
  className += ' cover';           // 覆盖模式
  style.width = coverRect.width * scale;
  style.height = coverRect.height * scale;
} else if (vertical) {
  className += ' vertical';        // 垂直插入线
  style.height = nearRect.height * scale;
} else {
  style.width = nearRect.width * scale;  // 水平插入线
}
```

#### **Insertion 样式实现：**

```less
.lc-insertion {
  position: absolute;
  top: -2px;                      // 默认向上偏移2px
  left: 0;
  z-index: 12;                    // 最高层级
  pointer-events: none !important;
  background-color: var(--color-brand-light);
  height: 4px;                    // 默认水平线高度

  &.cover {
    top: 0;                       // 覆盖模式：重置偏移
    height: auto;                 // 覆盖模式：高度自动
    width: auto;                  // 覆盖模式：宽度自动
    border: none;                 // 覆盖模式：无边框
    opacity: 0.3;                 // 覆盖模式：半透明矩形
  }

  &.vertical {
    top: 0;                       // 垂直线：重置偏移
    left: -2px;                   // 垂直线：向左偏移2px
    width: 4px;                   // 垂直线：固定宽度4px
    height: auto;                 // 垂直线：高度自动
  }

  &.invalid {
    background-color: var(--color-error, red);  // 无效位置：红色提示
  }
}
```

#### **🎯 三种渲染模式详解：**

##### **1. 水平线模式（默认）**

```typescript
// 默认情况：渲染4px高的水平蓝色线条
style = {
  width: nearRect.width * scale,    // 宽度 = 目标组件宽度
  height: 4,                        // 固定高度4px
  transform: `translate3d(${x}px, ${y}px, 0)`
};
className = 'lc-insertion';         // 只有基础类名
```

##### **2. 垂直线模式**

```typescript
// 垂直布局容器：渲染4px宽的垂直蓝色线条
if (vertical) {
  className += ' vertical';
  style = {
    width: 4,                       // 固定宽度4px
    height: nearRect.height * scale, // 高度 = 目标组件高度
    transform: `translate3d(${x}px, ${y}px, 0)`
  };
}
```

##### **3. 覆盖模式（矩形）**

```typescript
// 替换模式：渲染半透明蓝色矩形
if (insertType === 'cover') {
  className += ' cover';
  style = {
    width: coverRect.width * scale,   // 完整目标宽度
    height: coverRect.height * scale, // 完整目标高度
    opacity: 0.3,                     // 30%透明度
    transform: `translate3d(${x}px, ${y}px, 0)`
  };
}
```

#### **🔍 为什么你看到的是线条而不是矩形？**

**这是正常的设计行为！** InsertionView 的渲染形态取决于拖拽的具体场景：

| 拖拽场景 | 渲染形态 | 视觉效果 | 触发条件 |
|---------|----------|----------|----------|
| **组件间插入** | 水平/垂直线条 | 4px 蓝色粗线 | `insertType = 'before/after'` |
| **组件替换** | 半透明矩形 | 30% 透明度蓝色区域 | `insertType = 'cover'` |
| **容器填充** | 半透明矩形 | 覆盖整个容器 | 空容器或无子组件时 |

**常见的线条情况：**

- ✅ **水平线**：在垂直排列的组件间拖拽时显示
- ✅ **垂直线**：在水平排列的组件间拖拽时显示
- ✅ **短线条**：在较小组件旁边拖拽时显示

**矩形出现的情况：**

- 🔲 拖拽到空容器内部时
- 🔲 拖拽准备替换现有组件时
- 🔲 拖拽到可接受子组件的区域时

#### **💡 如何看到矩形效果？**

想要看到半透明蓝色矩形，可以尝试以下操作：

1. **拖拽到空的 Div 容器**：

   ```typescript
   // 当目标容器为空且无children时，触发cover模式
   if (detail.near) {
     // 有邻近组件 -> 显示线条
   } else {
     // 无邻近组件 -> 显示覆盖矩形
     ret.coverRect = ret.edge;
     ret.insertType = 'cover';
   }
   ```

2. **拖拽到 Layout 组件的空白区域**
3. **在大纲树中拖拽到容器节点上**（而不是插入到子节点间）
4. **拖拽到支持替换的组件位置**

**线条 vs 矩形的判断逻辑：**

```typescript
// 核心判断代码（简化版）
if (detail.near && detail.near.pos !== 'replace') {
  // 有邻近组件且非替换模式 -> 线条
  insertType = detail.near.pos; // 'before' 或 'after'
} else {
  // 无邻近组件或替换模式 -> 矩形
  insertType = 'cover';
}
```

---

### **4. BorderResizing - 尺寸调整边框**

**职责：** 为支持尺寸调整的组件提供调整手柄

#### **Resizing 监听机制：**

```typescript
@observer
export class BoxResizing extends Component<{ host: BuiltinSimulatorHost }> {
  @computed get selecting() {
    const doc = this.host.currentDocument;
    const { selection } = doc;
    return this.dragging ? selection.getTopNodes() : selection.getNodes();
  }

  get dragging() {
    return this.host.designer.dragon.dragging;  // 拖拽时隐藏调整手柄
  }
}
```

#### **八方向调整手柄：**

```typescript
// 🎯 八个方向的调整手柄元素
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// 绑定拖拽事件到每个方向
unBind.push(
  ...[
    this.dragEngine.from(this.outlineN, 'n', () => node),
    this.dragEngine.from(this.outlineE, 'e', () => node),
    // ... 其他方向
  ]
);
```

#### **回调事件系统：**

```typescript
// 🔧 组件元数据中的调整回调
const { advanced } = node.componentMeta;
if (advanced.callbacks?.onResize) {
  advanced.callbacks.onResize(e, node);
}

// 🎉 发射调整完成事件
editor?.eventBus.emit('designer.border.resize', {
  selected: componentName,
  layout: node?.parent?.getPropValue('layout') || '',
});
```

#### **Resizing 样式实现：**

```less
&.lc-resize-corner {
  display: inline-block;
  width: 8px;
  height: 8px;
  border: 1px solid var(--color-brand);
  background: var(--color-block-background-normal);
  pointer-events: auto;       // 允许交互
  z-index: 2;
}

&.lc-resize-side {
  pointer-events: auto;       // 允许交互
  display: flex;
  align-items: center;
  justify-content: center;

  &.e, &.w {
    cursor: ew-resize;        // 水平调整光标
  }

  &.n, &.s {
    cursor: ns-resize;        // 垂直调整光标
  }
}
```

---

### **5. BorderContainer - 响应式容器边框**

**职责：** 显示响应式断点容器的边界（可配置开启）

#### **Container 启用条件：**

```typescript
// 🔧 通过引擎配置控制
{ engineConfig.get('enableReactiveContainer') &&
  <BorderContainer key="reactive-container-border" host={host} />
}
```

## 🎛️ 全局控制机制

### **前置条件判断**

```typescript
// 1. 设计模式检查
if (designMode === 'live') {
  return null;  // 预览模式不显示任何工具
}

// 2. 检测功能开关
{ !engineConfig.get('disableDetecting') &&
  <BorderDetecting host={host} />
}

// 3. 组件操作开关
const hideComponentAction = engineConfig.get('hideComponentAction');
if (!dragging && !hideComponentAction) {
  return <Toolbar observed={observed} />;
}

// 4. 选择工具开关
const { hideSelectTools } = observed.node.componentMeta.advanced;
if (hideSelectTools) {
  return null;
}
```

### **坐标转换系统**

```typescript
// 🔄 核心坐标转换逻辑
const { scrollX, scrollY, scale } = host.viewport;

// 主容器偏移（处理画布滚动）
style={{ transform: `translate(${-scrollX * scale}px,${-scrollY * scale}px)` }}

// 边框实例位置（处理组件定位）
transform: `translate3d(${(scrollX + rect.left) * scale}px, ${(scrollY + rect.top) * scale}px, 0)`

// 尺寸缩放
width: rect.width * scale,
height: rect.height * scale,
```

## 🎨 样式系统架构

### **核心样式变量**

```less
// 主要颜色变量
--color-brand-light: #006cff;                    // 主题蓝色
--color-canvas-detecting-background: rgba(0,121,242,.04);  // 检测背景
--color-layer-mask-background: rgba(182, 178, 178, 0.8);   // 拖拽蒙层
--color-error: red;                              // 错误状态

// 边框通用样式
.lc-borders {
  box-sizing: border-box;
  pointer-events: none;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  border: 1px solid var(--color-brand-light);
  will-change: transform, width, height;         // GPU 加速
  overflow: visible;
}
```

### **层级管理（Z-index）**

```text
├── lc-insertion (z-index: 12)           ← 最高：插入指示器
├── lc-resize-corner (z-index: 2)        ← 调整手柄角点
├── lc-borders-selecting (z-index: 2)    ← 选中边框
├── lc-borders-detecting (z-index: 1)    ← 检测边框
└── lc-bem-tools (z-index: 1)            ← 基础容器
```

## 📡 事件监听总结

### **主要监听的状态变化**

| 状态源 | 属性 | 监听组件 | 用途 |
|--------|------|----------|------|
| `host.designer.dragon` | `dragging` | 所有组件 | 拖拽状态控制 |
| `document.detecting` | `current` | BorderDetecting | 悬停节点 |
| `document.selection` | `getNodes()` | BorderSelecting, BorderResizing | 选中节点 |
| `document` | `dropLocation` | InsertionView | 拖拽位置 |
| `host.viewport` | `scrollX/Y, scale` | 所有组件 | 坐标转换 |
| `host` | `designMode` | BemTools | 模式控制 |

### **发射的事件**

| 事件名 | 发射者 | 参数 | 用途 |
|--------|--------|------|------|
| `designer.border.action` | Toolbar | `{name, selected}` | 工具栏操作 |
| `designer.border.resize` | BorderResizing | `{selected, layout}` | 尺寸调整完成 |

## 🔍 扩展机制

### **自定义 BEM 工具注册**

```typescript
// 🔧 支持插件注册额外的设计工具
{
  (host.designer as any).bemToolsManager?.getAllBemTools?.()?.map((tools: any) => {
    const ToolsCls = tools.item;
    return <ToolsCls key={tools.name} host={host} />;
  }) || []
}
```

## 📊 性能优化特性

### **MobX 响应式更新**

- 使用 `@observer` 装饰器实现精确的局部更新
- `@computed` 缓存计算结果，避免重复计算

### **GPU 加速**

```less
will-change: transform, width, height;  // 提示浏览器优化这些属性的变化
transform: translate3d(...);            // 使用 3D 变换触发硬件加速
```

### **事件穿透优化**

```less
pointer-events: none;     // 容器不阻断事件
pointer-events: auto;     // 交互元素允许事件
```

## 🎯 总结

BemTools 是一个高度集成的设计辅助工具系统，通过以下机制实现：

1. **响应式架构** - MobX 驱动的状态监听和更新
2. **模块化设计** - 五大核心工具组件各司其职
3. **坐标转换** - 复杂的缩放和滚动坐标同步
4. **样式系统** - 分层管理的 CSS 架构
5. **事件系统** - 完善的状态监听和事件发射
6. **扩展机制** - 支持插件注册自定义工具
7. **性能优化** - GPU 加速和事件穿透优化

这套系统为低代码引擎提供了完整的可视化设计体验，是设计态用户交互的核心基础设施。
