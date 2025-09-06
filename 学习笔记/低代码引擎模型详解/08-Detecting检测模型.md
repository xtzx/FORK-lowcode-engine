# Detecting - 检测模型详解

## 1. 模型概述

`Detecting` 是低代码引擎中负责组件悬停检测的模型。当用户鼠标在画布上移动时，它能实时检测并高亮显示鼠标下方的组件，提供视觉反馈，是提升编辑体验的重要功能。

## 2. 核心属性

### 2.1 基础属性

```typescript
class Detecting {
  // 是否启用检测
  _enable: boolean = true;

  // X射线模式（透视模式）
  xRayMode: boolean = false;

  // 当前检测到的节点
  _current: Node | null = null;

  // 事件发射器
  emitter: IEventBus;

  // 检测延迟定时器
  timer?: number;
}
```

### 2.2 计算属性

```typescript
{
  // 是否启用（getter/setter）
  enable: boolean;

  // 当前悬停节点（getter）
  current: Node | null;

  // 是否有悬停节点
  hasCurrent: boolean;

  // 悬停节点路径
  currentPath: Node[];
}
```

## 3. 核心方法

### 3.1 基础操作

```typescript
// 捕获节点
capture(node: Node | null): void;

// 清除当前检测
clear(): void;

// 离开文档
leave(document?: DocumentModel): void;

// 启用/禁用检测
setEnable(enable: boolean): void;

// 切换X射线模式
toggleXRayMode(): void;
```

### 3.2 检测操作

```typescript
// 检测元素下的节点
detectNode(element: HTMLElement): Node | null;

// 检测点下的节点
detectNodeAt(x: number, y: number): Node | null;

// 检测区域内的节点
detectNodesInRect(rect: IPublicTypeRect): Node[];

// 刷新检测状态
refresh(): void;
```

### 3.3 事件相关

```typescript
// 监听检测变化
onChange(fn: (node: Node | null) => void): IPublicTypeDisposable;

// 监听启用状态变化
onEnableChange(fn: (enable: boolean) => void): IPublicTypeDisposable;

// 监听X射线模式变化
onXRayModeChange(fn: (xRayMode: boolean) => void): IPublicTypeDisposable;
```

## 4. 核心原理

### 4.1 检测机制

```typescript
// 节点检测流程
capture(node: Node | null) {
  // 忽略相同节点
  if (this._current === node) return;

  // 检查是否启用
  if (!this._enable) return;

  // 检查节点有效性
  if (node && !this.isDetectable(node)) return;

  // 更新当前节点
  const previous = this._current;
  this._current = node;

  // 触发变化事件
  this.emitter.emit('detectingChange', {
    current: node,
    previous
  });
}

// 节点可检测性判断
isDetectable(node: Node): boolean {
  // 隐藏节点不可检测
  if (node.hidden) return false;

  // 锁定节点在非X射线模式下不可检测
  if (node.isLocked && !this.xRayMode) return false;

  // 模态节点特殊处理
  if (node.isModal) return false;

  return true;
}
```

### 4.2 X射线模式

```typescript
// X射线模式实现
class XRayDetecting extends Detecting {
  detectNode(element: HTMLElement): Node | null {
    if (!this.xRayMode) {
      // 普通模式：只检测最上层
      return super.detectNode(element);
    }

    // X射线模式：穿透检测
    const nodes = this.detectAllNodes(element);

    // 返回最深层的可编辑节点
    return nodes.find(node =>
      !node.isLocked && node.isEditable
    ) || nodes[0];
  }

  // 检测所有层级的节点
  private detectAllNodes(element: HTMLElement): Node[] {
    const nodes: Node[] = [];
    let current = element;

    while (current) {
      const node = this.getNodeFromElement(current);
      if (node) nodes.push(node);
      current = current.parentElement;
    }

    return nodes;
  }
}
```

### 4.3 延迟检测

```typescript
// 延迟检测实现（避免频繁触发）
private delayedCapture(node: Node | null, delay: number = 50) {
  // 清除之前的定时器
  if (this.timer) {
    clearTimeout(this.timer);
  }

  // 设置新的延迟
  this.timer = setTimeout(() => {
    this.capture(node);
    this.timer = undefined;
  }, delay);
}
```

### 4.4 路径计算

```typescript
// 计算节点路径
@computed get currentPath(): Node[] {
  if (!this._current) return [];

  const path: Node[] = [];
  let node: Node | null = this._current;

  while (node) {
    path.unshift(node);
    node = node.parent;
  }

  return path;
}
```

## 5. 检测模式

### 5.1 普通模式

```typescript
// 普通模式：检测最上层可见节点
detecting.setEnable(true);
detecting.xRayMode = false;

// 鼠标悬停时检测
onMouseMove(e: MouseEvent) {
  const element = e.target as HTMLElement;
  const node = detecting.detectNode(element);
  detecting.capture(node);
}
```

### 5.2 X射线模式

```typescript
// X射线模式：可以穿透查看被遮挡的节点
detecting.toggleXRayMode();

// 在X射线模式下，可以检测到：
// - 被其他元素遮挡的节点
// - 锁定状态的节点
// - 深层嵌套的节点
```

### 5.3 禁用模式

```typescript
// 禁用检测（拖拽时等场景）
detecting.setEnable(false);

// 恢复检测
detecting.setEnable(true);
```

## 6. 与其他模型的关系

### 6.1 与 Node 的关系
- Detecting 检测并高亮 Node
- Node 可以控制自己是否可被检测
- 通过 Node 的状态判断检测行为

### 6.2 与 Dragon 的关系
- 拖拽开始时禁用检测
- 拖拽结束后恢复检测
- 避免拖拽时的干扰

### 6.3 与 Selection 的关系
- 检测提供悬停反馈
- 点击检测到的节点触发选择
- 两者配合完成交互流程

### 6.4 与 Simulator 的关系
- Simulator 处理鼠标事件
- 调用 Detecting 进行节点检测
- 渲染检测的视觉效果

## 7. 使用方式

### 7.1 基础使用

```typescript
// 获取检测管理器
const detecting = document.detecting;

// 启用/禁用检测
detecting.setEnable(true);

// 获取当前悬停节点
const currentNode = detecting.current;

// 清除检测
detecting.clear();
```

### 7.2 事件监听

```typescript
// 监听检测变化
const dispose = detecting.onChange((node) => {
  if (node) {
    console.log('悬停在:', node.componentName);
    showNodeInfo(node);
  } else {
    hideNodeInfo();
  }
});

// 监听X射线模式
detecting.onXRayModeChange((enabled) => {
  console.log('X射线模式:', enabled ? '开启' : '关闭');
});
```

### 7.3 手动检测

```typescript
// 检测特定坐标
const node = detecting.detectNodeAt(100, 200);

// 检测元素
const element = document.elementFromPoint(x, y);
const node = detecting.detectNode(element);

// 检测区域
const nodes = detecting.detectNodesInRect({
  left: 100,
  top: 100,
  width: 200,
  height: 200
});
```

### 7.4 路径追踪

```typescript
// 获取悬停节点的完整路径
const path = detecting.currentPath;

// 显示面包屑导航
path.forEach((node, index) => {
  console.log(`${'  '.repeat(index)}└─ ${node.componentName}`);
});
```

## 8. 高级特性

### 8.1 智能检测

```typescript
// 智能检测扩展
class SmartDetecting extends Detecting {
  // 检测优先级
  private getPriority(node: Node): number {
    // 容器节点优先级较低
    if (node.isContainer && node.children?.size > 0) {
      return 1;
    }

    // 叶子节点优先级高
    if (node.isLeaf) {
      return 10;
    }

    // 可编辑节点优先级高
    if (node.componentMeta.isEditable) {
      return 8;
    }

    return 5;
  }

  // 智能选择最合适的节点
  detectNode(element: HTMLElement): Node | null {
    const candidates = this.getAllCandidates(element);

    // 按优先级排序
    candidates.sort((a, b) =>
      this.getPriority(b) - this.getPriority(a)
    );

    return candidates[0] || null;
  }
}
```

### 8.2 检测缓存

```typescript
// 检测结果缓存
class CachedDetecting extends Detecting {
  private cache = new Map<HTMLElement, Node>();
  private cacheTimer?: number;

  detectNode(element: HTMLElement): Node | null {
    // 查找缓存
    if (this.cache.has(element)) {
      return this.cache.get(element)!;
    }

    // 执行检测
    const node = super.detectNode(element);

    // 缓存结果
    if (node) {
      this.cache.set(element, node);
      this.scheduleCacheClear();
    }

    return node;
  }

  // 定期清理缓存
  private scheduleCacheClear() {
    if (this.cacheTimer) return;

    this.cacheTimer = setTimeout(() => {
      this.cache.clear();
      this.cacheTimer = undefined;
    }, 1000);
  }
}
```

### 8.3 检测区域限制

```typescript
// 限制检测区域
class BoundedDetecting extends Detecting {
  private bounds?: DOMRect;

  // 设置检测边界
  setBounds(bounds: DOMRect | null) {
    this.bounds = bounds || undefined;
  }

  // 检查是否在边界内
  private isInBounds(x: number, y: number): boolean {
    if (!this.bounds) return true;

    return x >= this.bounds.left &&
           x <= this.bounds.right &&
           y >= this.bounds.top &&
           y <= this.bounds.bottom;
  }

  detectNodeAt(x: number, y: number): Node | null {
    if (!this.isInBounds(x, y)) {
      return null;
    }

    return super.detectNodeAt(x, y);
  }
}
```

## 9. 注意事项

### 9.1 性能优化
- 使用延迟检测避免频繁触发
- 实现检测结果缓存
- 限制检测范围提升效率

### 9.2 状态管理
- 拖拽时禁用检测
- 编辑时暂停检测
- 及时清理检测状态

### 9.3 用户体验
- 提供清晰的视觉反馈
- 避免检测跳动
- 支持键盘导航配合

### 9.4 边界处理
- 处理节点删除情况
- 处理隐藏节点
- 处理动态加载的节点

## 10. 最佳实践

### 10.1 检测策略

```typescript
// 检测策略管理
class DetectingStrategy {
  constructor(private detecting: Detecting) {}

  // 编辑模式策略
  setEditMode() {
    this.detecting.setEnable(true);
    this.detecting.xRayMode = false;
  }

  // 预览模式策略
  setPreviewMode() {
    this.detecting.setEnable(false);
  }

  // 调试模式策略
  setDebugMode() {
    this.detecting.setEnable(true);
    this.detecting.xRayMode = true;
  }

  // 拖拽模式策略
  setDragMode() {
    // 暂存当前状态
    const wasEnabled = this.detecting.enable;
    const wasXRay = this.detecting.xRayMode;

    // 禁用检测
    this.detecting.setEnable(false);

    // 返回恢复函数
    return () => {
      this.detecting.setEnable(wasEnabled);
      this.detecting.xRayMode = wasXRay;
    };
  }
}
```

### 10.2 视觉反馈增强

```typescript
// 增强的视觉反馈
class EnhancedDetecting extends Detecting {
  private highlighter?: IHighlighter;

  capture(node: Node | null) {
    // 清除之前的高亮
    this.highlighter?.clear();

    // 调用父类方法
    super.capture(node);

    // 添加高亮效果
    if (node) {
      this.highlighter = this.createHighlighter(node);
      this.highlighter.show();
    }
  }

  private createHighlighter(node: Node): IHighlighter {
    return {
      show: () => {
        // 显示边框
        this.showBorder(node);

        // 显示标签
        this.showLabel(node);

        // 显示尺寸信息
        this.showDimensions(node);
      },

      clear: () => {
        // 清除所有视觉效果
        this.clearVisualEffects();
      }
    };
  }
}
```

### 10.3 检测历史

```typescript
// 检测历史记录
class DetectingHistory {
  private history: Array<{
    node: Node | null;
    timestamp: number;
  }> = [];

  constructor(
    private detecting: Detecting,
    private maxSize: number = 10
  ) {
    detecting.onChange(this.record.bind(this));
  }

  // 记录检测历史
  private record(node: Node | null) {
    this.history.push({
      node,
      timestamp: Date.now()
    });

    // 限制历史大小
    if (this.history.length > this.maxSize) {
      this.history.shift();
    }
  }

  // 获取最近检测的节点
  getRecent(count: number = 5): Node[] {
    return this.history
      .slice(-count)
      .map(item => item.node)
      .filter(Boolean) as Node[];
  }

  // 获取检测路径
  getPath(): Node[] {
    const nodes = this.getRecent();
    // 去重并保持顺序
    return Array.from(new Set(nodes));
  }
}
```
