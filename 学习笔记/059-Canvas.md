我来为你详细分析 **Canvas 模块**的功能、关联模块和底层原理。
Ran tool

Ran tool

Ran tool
Ran tool
Ran tool

Ran tool
Ran tool

好的，现在我为你详细分析 **Canvas 模块**（画布 API）的功能、关联模块和底层原理。

---

## Canvas 模块全面解析

### 一、核心定位和作用

**Canvas（画布）** 是低代码引擎的 **可视化编辑区域**，它提供了拖拽、滚动、定位等核心交互能力。Canvas 不是一个简单的画布组件，而是一个包含了拖拽引擎、活动追踪、剪贴板等多个子系统的复杂模块。

**核心职责**：
1. **拖拽系统（Dragon）**：管理所有的拖拽操作
2. **活动追踪（ActiveTracker）**：追踪当前激活/悬停的节点
3. **剪贴板（Clipboard）**：管理复制粘贴操作
4. **滚动控制（Scroller）**：控制画布的滚动
5. **位置计算（DropLocation）**：计算组件的插入位置

---

## 架构层次

```
packages/shell/src/api/canvas.ts (对外 API 层)
    ↓
packages/designer/src (核心实现层)
    ├── dragon/ (拖拽引擎)
    ├── active-tracker.ts (活动追踪)
    └── clipboard.ts (剪贴板)
    ↓
packages/designer/src/builtin-simulator/ (模拟器层)
    ├── host.ts (模拟器宿主)
    └── host-view.tsx (模拟器视图)
```

---

## 核心变量详解

### 1. **dragon - 拖拽引擎** ⭐⭐⭐

**作用**: 这是整个画布交互的核心，管理所有的拖拽操作。

**底层原理**:

**Dragon 拖拽引擎架构**:
```
用户拖拽组件
    ↓
Dragon.boost() 发射拖拽对象
    ↓
Sensor 感应层（监听鼠标移动）
    ↓
定位系统计算插入位置
    ↓
绘制插入线/选择框
    ↓
松开鼠标，触发 onDragend
    ↓
插入组件到文档树
```

**关键流程**:

```typescript
// packages/designer/src/designer/dragon.ts: 170-662

boost(dragObject, boostEvent, fromRglNode) {
  // 第一阶段：初始化
  const newBie = !isDragNodeObject(dragObject);  // 是否从组件库拖入
  const masterSensors = this.getMasterSensors(); // 获取所有 Sensor（画布）

  // 第二阶段：绑定事件监听器
  handleEvents.on('mousemove', (e) => {
    // 持续计算鼠标位置
    this.locate(e);  // 定位插入位置
  });

  handleEvents.on('mouseup', (e) => {
    // 拖拽结束
    this.emitter.emit('dragend', {
      dragObject,
      copy: this.copy
    });
  });

  // 第三阶段：发射拖拽开始事件
  this.emitter.emit('dragstart', locateEvent);
}
```

**拖拽对象类型**:

1. **NodeData**（从组件库拖入）:
```javascript
{
  type: 'NodeData',
  data: {
    componentName: 'Button',
    props: {
      type: 'primary',
      children: '按钮'
    }
  }
}
```

2. **Node**（从画布移动）:
```javascript
{
  type: 'Node',
  nodes: [node1, node2],  // 可以拖拽多个节点
}
```

**使用示例**:

**场景1：监听拖拽事件**
```javascript
import { canvas } from '@alilc/lowcode-engine';

// 监听拖拽开始
canvas.dragon.onDragstart((e) => {
  console.log('拖拽开始:', e.dragObject);
  console.log('鼠标位置:', e.globalX, e.globalY);

  // 可以修改拖拽行为
  if (e.dragObject.nodes[0].componentName === 'Page') {
    // 禁止拖拽 Page 组件
    e.cancel();
  }
});

// 监听拖拽中
canvas.dragon.onDrag((e) => {
  console.log('拖拽中:', e.globalX, e.globalY);
  console.log('目标容器:', e.target);
});

// 监听拖拽结束
canvas.dragon.onDragend(({ dragObject, copy }) => {
  console.log('拖拽结束');
  console.log('拖拽对象:', dragObject);
  console.log('是否复制:', copy);  // true=复制，false=移动

  // 拖拽完成后的处理
  if (copy) {
    console.log('节点已复制');
  } else {
    console.log('节点已移动');
  }
});
```

**场景2：自定义拖拽区域**
```javascript
// 从自定义区域拖拽组件
const componentPanel = document.querySelector('.component-panel');

canvas.dragon.from(componentPanel, (e) => {
  // e 是鼠标事件
  const target = e.target;
  const componentName = target.dataset.component;

  if (!componentName) {
    return null;  // 不是组件，取消拖拽
  }

  // 返回拖拽对象
  return {
    type: 'NodeData',
    data: {
      componentName,
      props: {}
    }
  };
});

// 结果：
// - 在 componentPanel 上按下鼠标
// - 拖拽出组件数据
// - 可以拖入画布
```

**场景3：程序化触发拖拽**
```javascript
// 手动触发拖拽（不通过鼠标）
const dragObject = {
  type: 'NodeData',
  data: {
    componentName: 'Button',
    props: {
      type: 'primary',
      children: '新按钮'
    }
  }
};

// 创建一个模拟的鼠标事件
const mouseEvent = new MouseEvent('mousedown', {
  clientX: 100,
  clientY: 100
});

// 发射拖拽
canvas.dragon.boost(dragObject, mouseEvent);

// 结果：
// - 开始拖拽一个 Button 组件
// - 跟随鼠标移动
// - 可以拖入画布
```

---

### 2. **activeTracker - 活动追踪器**

**作用**: 追踪当前激活（悬停）的节点，用于显示辅助工具（选择框、调整手柄等）。

**底层原理**:

```typescript
// packages/designer/src/designer/active-tracker.ts

export class ActiveTracker {
  private _target: ActiveTarget | null = null;

  // 追踪节点
  track(node: INode) {
    this._target = {
      node,
      detail: node.getDetail(),
      instance: node.getInstance()
    };

    // 发出变化事件
    this.emitter.emit('change', this._target);
  }

  // 获取当前目标
  get target() {
    return this._target;
  }
}
```

**与 BemTools 的关系**:

```typescript
// packages/designer/src/builtin-simulator/bem-tools/index.tsx

@observer
export class BemTools extends Component {
  componentDidMount() {
    const { designer } = this.props.host;

    // 监听 activeTracker 变化
    designer.activeTracker.onChange((target) => {
      if (target) {
        // 显示选择框
        this.renderSelectionBox(target.node);
        // 显示调整手柄
        this.renderResizeHandles(target.node);
      }
    });
  }
}
```

**使用示例**:

**场景1：监听节点激活**
```javascript
import { canvas } from '@alilc/lowcode-engine';

canvas.activeTracker.onChange((target) => {
  if (!target) {
    console.log('没有激活的节点');
    return;
  }

  console.log('激活的节点:', target.node.componentName);
  console.log('节点 ID:', target.node.id);
  console.log('节点实例:', target.instance);
  console.log('节点详情:', target.detail);

  // 可以做一些自定义操作
  if (target.node.componentName === 'Table') {
    showTableToolbar(target.node);
  }
});
```

**场景2：手动追踪节点**
```javascript
import { project, canvas } from '@alilc/lowcode-engine';

// 获取某个节点
const doc = project.currentDocument;
const node = doc.getNodeById('node_abc123');

// 手动追踪这个节点（会触发选择框显示）
canvas.activeTracker.track(node);

// 结果：
// - 节点被选中
// - 显示选择框和调整手柄
// - 触发 onChange 回调
```

**场景3：自定义节点高亮**
```javascript
canvas.activeTracker.onChange((target) => {
  // 移除之前的高亮
  document.querySelectorAll('.custom-highlight').forEach(el => {
    el.classList.remove('custom-highlight');
  });

  if (target) {
    // 添加自定义高亮样式
    const nodeElement = getNodeElement(target.node);
    nodeElement.classList.add('custom-highlight');
  }
});
```

---

### 3. **isInLiveEditing - 是否处于实时编辑状态**

**作用**: 判断当前是否在"实时编辑"模式。

**什么是 LiveEditing**:
- **普通模式**: 双击节点进入编辑，编辑完成后失焦保存
- **LiveEditing 模式**: 直接在画布中编辑内容，实时生效

**底层原理**:
```typescript
// packages/shell/src/api/canvas.ts: 45-47
get isInLiveEditing(): boolean {
  return Boolean(this[editorSymbol].get('designer')?.project?.simulator?.liveEditing?.editing);
}
```

**使用示例**:
```javascript
import { canvas } from '@alilc/lowcode-engine';

// 检查是否在实时编辑
if (canvas.isInLiveEditing) {
  console.log('正在实时编辑');
  // 禁用某些操作
  disableDrag();
} else {
  console.log('普通编辑模式');
}
```

---

### 4. **clipboard - 剪贴板**

**作用**: 管理组件的复制粘贴操作。

**底层原理**:
```typescript
// packages/designer/src/designer/clipboard.ts

export class Clipboard {
  private data: any = null;

  // 设置剪贴板数据
  setData(data: any) {
    this.data = data;
  }

  // 等待粘贴数据
  waitPasteData(keyboardEvent: KeyboardEvent, cb: Function) {
    // 监听剪贴板事件
    const handlePaste = (e: ClipboardEvent) => {
      cb(this.data, e);
      document.removeEventListener('paste', handlePaste);
    };

    document.addEventListener('paste', handlePaste);
  }
}
```

**使用示例**:

**场景1：自定义复制粘贴**
```javascript
import { canvas, project } from '@alilc/lowcode-engine';

// 监听键盘事件
document.addEventListener('keydown', (e) => {
  // Ctrl+C 复制
  if (e.ctrlKey && e.key === 'c') {
    const selection = project.currentDocument.selection;
    const selectedNodes = selection.getNodes();

    if (selectedNodes.length > 0) {
      // 导出节点 schema
      const schemas = selectedNodes.map(node => node.exportSchema());

      // 保存到剪贴板
      canvas.clipboard.setData(schemas);

      console.log('已复制', schemas.length, '个节点');
    }
  }

  // Ctrl+V 粘贴
  if (e.ctrlKey && e.key === 'v') {
    canvas.clipboard.waitPasteData(e, (schemas, clipboardEvent) => {
      if (schemas && schemas.length > 0) {
        const doc = project.currentDocument;
        const root = doc.root;

        // 粘贴节点
        schemas.forEach(schema => {
          doc.createNode(schema, root);
        });

        console.log('已粘贴', schemas.length, '个节点');
      }
    });
  }
});
```

**场景2：跨页面复制粘贴**
```javascript
// 页面 A：复制
const node = project.currentDocument.getNodeById('node_abc');
const schema = node.exportSchema();

// 保存到 localStorage
localStorage.setItem('copied-node', JSON.stringify(schema));
canvas.clipboard.setData(schema);

// 页面 B：粘贴
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'v') {
    canvas.clipboard.waitPasteData(e, () => {
      // 从 localStorage 读取
      const schema = JSON.parse(localStorage.getItem('copied-node'));

      // 粘贴节点
      project.currentDocument.createNode(schema);
    });
  }
});
```

---

## 核心方法详解

### 1. **createLocation() - 创建插入位置** ⭐

**作用**: 创建一个描述组件插入位置的对象。

**LocationData 数据结构**:
```javascript
{
  target: node,        // 目标节点（插入到哪个节点）
  detail: {
    type: 'Children',  // 插入类型（Children/Props等）
    index: 2,          // 插入索引（第几个位置）
    near: {            // 附近信息
      node: siblingNode,
      pos: 'after'     // before/after
    }
  }
}
```

**底层原理**:
```typescript
// packages/designer/src/designer/designer.ts

createLocation(locationData) {
  return new DropLocation({
    target: locationData.target,
    detail: {
      type: locationData.detail.type,
      index: locationData.detail.index,
      valid: true  // 是否有效的插入位置
    }
  });
}
```

**使用示例**:

**场景1：手动插入组件到指定位置**
```javascript
import { canvas, project } from '@alilc/lowcode-engine';

const doc = project.currentDocument;
const container = doc.root;  // 根节点作为容器

// 创建插入位置（插入到第 2 个位置）
const location = canvas.createLocation({
  target: container,
  detail: {
    type: 'Children',
    index: 2
  }
});

// 创建新节点
const newNode = doc.createNode({
  componentName: 'Button',
  props: {
    type: 'primary',
    children: '新按钮'
  }
});

// 插入节点
container.insertBefore(newNode, location.detail.index);

// 结果：
// - Button 组件被插入到容器的第 2 个位置
```

**场景2：在指定节点之后插入**
```javascript
const targetNode = doc.getNodeById('node_abc');
const parent = targetNode.parent;

// 创建位置（在 targetNode 之后）
const location = canvas.createLocation({
  target: parent,
  detail: {
    type: 'Children',
    index: parent.children.indexOf(targetNode) + 1,
    near: {
      node: targetNode,
      pos: 'after'
    }
  }
});

// 插入新节点
const newNode = doc.createNode({...});
parent.insertBefore(newNode, location.detail.index);
```

---

### 2. **createScroller() - 创建滚动控制器**

**作用**: 创建一个滚动控制器，用于控制画布的滚动。

**Scroller 的作用**:
- 当拖拽到边缘时自动滚动
- 支持平滑滚动到指定位置
- 支持滚动到指定节点

**使用示例**:

**场景1：创建画布滚动器**
```javascript
import { canvas } from '@alilc/lowcode-engine';

// 创建 Scrollable 对象
const scrollable = {
  scrollTarget: canvas.createScrollTarget(viewportElement),
  bounds: viewportElement.getBoundingClientRect()
};

// 创建 Scroller
const scroller = canvas.createScroller(scrollable);

// 滚动到指定位置
scroller.scrollTo({
  left: 100,
  top: 200
});

// 平滑滚动
scroller.scrollTo({
  left: 100,
  top: 200,
  smooth: true
});
```

**场景2：滚动到指定节点**
```javascript
// 获取节点
const node = project.currentDocument.getNodeById('node_abc');

// 获取节点的 DOM 元素
const nodeElement = getNodeElement(node);
const rect = nodeElement.getBoundingClientRect();

// 滚动到节点位置
scroller.scrollTo({
  left: rect.left,
  top: rect.top - 100,  // 留出一些顶部空间
  smooth: true
});
```

---

### 3. **createScrollTarget() - 创建滚动目标**

**作用**: 将一个 DOM 元素包装成滚动目标。

**使用示例**:
```javascript
const viewportElement = document.querySelector('.lc-simulator-canvas-viewport');
const scrollTarget = canvas.createScrollTarget(viewportElement);

// scrollTarget 包含：
// - shell: DOM 元素
// - scrollLeft, scrollTop: 滚动位置
// - scrollWidth, scrollHeight: 内容尺寸
```

---

## 与模拟器的关系（基于 host-view.tsx）

### 模拟器视图层级结构

从你提供的 `host-view.tsx` 文件可以看出完整的层级结构：

```
BuiltinSimulatorHostView (模拟器宿主视图)
    ↓
Canvas (画布容器)
    ↓
.lc-simulator-canvas-viewport (视口)
    ├── BemTools (辅助工具层)
    │   ├── 选择框
    │   ├── 插入线
    │   ├── 调整手柄
    │   └── 辅助按钮
    │
    └── Content (内容层)
        └── iframe (模拟器 iframe)
            └── React Renderer
                └── 低代码组件
```

### 关键代码解析

**1. 模拟器宿主创建**:
```typescript
// packages/designer/src/builtin-simulator/host-view.tsx: 47-61

constructor(props) {
  const { project, onMount, designer } = this.props;

  // 复用或创建模拟器实例
  this.host = (project.simulator as BuiltinSimulatorHost) ||
    new BuiltinSimulatorHost(project, designer);

  // 设置属性（设备类型、缩放等）
  this.host.setProps(this.props);

  // 触发挂载回调
  onMount?.(this.host);
}
```

**2. 画布渲染**:
```typescript
// packages/designer/src/builtin-simulator/host-view.tsx: 92-123

render() {
  const sim = this.props.host;
  let className = 'lc-simulator-canvas';

  // 设备样式
  const { canvas = {}, viewport = {} } = sim.deviceStyle || {};

  // 设备类名
  if (sim.deviceClassName) {
    className += ` ${sim.deviceClassName}`;
  } else if (sim.device) {
    className += ` lc-simulator-device-${sim.device}`;
  }

  return (
    <div className={className} style={canvas}>
      <div
        ref={(elmt) => sim.mountViewport(elmt)}
        className="lc-simulator-canvas-viewport"
        style={viewport}
      >
        <BemTools host={sim} />  {/* 辅助工具 */}
        <Content host={sim} />    {/* iframe */}
      </div>
    </div>
  );
}
```

**3. iframe 渲染**:
```typescript
// packages/designer/src/builtin-simulator/host-view.tsx: 167-197

render() {
  const { viewport } = sim;

  // iframe 样式（缩放）
  const frameStyle = {
    transform: `scale(${viewport.scale})`,
    height: viewport.contentHeight,
    width: viewport.contentWidth,
  };

  // 禁用事件（拖拽时）
  if (disabledEvents) {
    frameStyle.pointerEvents = 'none';
  }

  return (
    <div className="lc-simulator-content">
      <iframe
        name={`${viewName}-SimulatorRenderer`}
        className="lc-simulator-content-frame"
        style={frameStyle}
        ref={(frame) => sim.mountContentFrame(frame)}
      />
    </div>
  );
}
```

---

## 完整使用流程示例

### 场景：实现一个完整的拖拽插入流程

```javascript
import { canvas, project, material } from '@alilc/lowcode-engine';

// 1. 加载组件库
await material.setAssets({
  packages: [...],
  components: [...]
});

// 2. 监听拖拽过程
canvas.dragon.onDragstart((e) => {
  console.log('开始拖拽:', e.dragObject);

  // 显示拖拽提示
  showDragTip(e.dragObject);
});

canvas.dragon.onDrag((e) => {
  // 更新拖拽提示位置
  updateDragTip(e.globalX, e.globalY);

  // 显示插入线
  if (e.dropLocation) {
    showInsertLine(e.dropLocation);
  }
});

canvas.dragon.onDragend(({ dragObject, copy }) => {
  console.log('拖拽结束');

  // 隐藏拖拽提示
  hideDragTip();

  // 隐藏插入线
  hideInsertLine();

  // 记录操作
  if (copy) {
    analytics.track('component_copy');
  } else {
    analytics.track('component_move');
  }
});

// 3. 监听节点激活
canvas.activeTracker.onChange((target) => {
  if (target) {
    console.log('激活节点:', target.node.componentName);

    // 显示属性面板
    showPropsPanel(target.node);
  }
});

// 4. 自定义复制粘贴
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'c') {
    const selection = project.currentDocument.selection;
    const nodes = selection.getNodes();

    if (nodes.length > 0) {
      const schemas = nodes.map(n => n.exportSchema());
      canvas.clipboard.setData(schemas);
      console.log('已复制', nodes.length, '个节点');
    }
  }

  if (e.ctrlKey && e.key === 'v') {
    canvas.clipboard.waitPasteData(e, (schemas) => {
      if (schemas) {
        const doc = project.currentDocument;
        schemas.forEach(schema => {
          doc.createNode(schema);
        });
        console.log('已粘贴', schemas.length, '个节点');
      }
    });
  }
});
```

---

## 总结

**Canvas 模块**是低代码引擎的**可视化交互中心**，它：

1. **Dragon（拖拽引擎）**：管理所有拖拽操作，是画布交互的核心
2. **ActiveTracker（活动追踪）**：追踪激活节点，驱动辅助工具显示
3. **Clipboard（剪贴板）**：管理复制粘贴操作
4. **Scroller（滚动控制）**：控制画布滚动，支持自动滚动
5. **DropLocation（位置计算）**：精确计算组件插入位置

Canvas 模块与模拟器（Simulator）紧密配合，通过 BemTools 提供可视化反馈，形成完整的WYSIWYG（所见即所得）编辑体验。