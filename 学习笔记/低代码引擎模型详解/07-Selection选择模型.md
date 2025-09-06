# Selection - 选择模型详解

## 1. 模型概述

`Selection` 是低代码引擎中管理节点选择状态的模型。它负责处理用户在画布上选择组件的行为，支持单选、多选、框选等多种选择方式，并提供选择状态的查询和操作接口。

## 2. 核心属性

### 2.1 基础属性

```typescript
class Selection {
  // 所属文档
  doc: DocumentModel;

  // 已选中的节点ID列表
  _selected: string[] = [];

  // 选中的节点列表（计算属性）
  selected: Node[];

  // 是否多选模式
  isMultiple: boolean;

  // 选择数量
  size: number;

  // 事件发射器
  emitter: IEventBus;
}
```

### 2.2 状态属性

```typescript
{
  // 是否为空选择
  isEmpty: boolean;

  // 第一个选中的节点
  first: Node | null;

  // 最后一个选中的节点
  last: Node | null;

  // 顶层选中节点（过滤掉被父节点包含的）
  topNodes: Node[];

  // 选择锚点（多选时的起始节点）
  anchor: Node | null;
}
```

## 3. 核心方法

### 3.1 基础操作

```typescript
// 选中节点
select(id: string | string[]): void;

// 添加到选择
add(id: string | string[]): void;

// 从选择中移除
remove(id: string | string[]): void;

// 清空选择
clear(): void;

// 全选
selectAll(nodes?: Node[]): void;

// 反选
inverse(): void;

// 切换选择状态
toggle(id: string): void;
```

### 3.2 查询操作

```typescript
// 是否包含节点
has(id: string): boolean;

// 是否包含任一节点
hasAny(ids: string[]): boolean;

// 是否包含所有节点
hasAll(ids: string[]): boolean;

// 获取选中的节点
getNodes(): Node[];

// 获取顶层节点
getTopNodes(): Node[];

// 获取选中节点ID
getIds(): string[];

// 检查节点是否被选中
isSelected(node: Node | string): boolean;
```

### 3.3 高级操作

```typescript
// 框选
selectByRect(rect: IPublicTypeRect): void;

// 根据条件选择
selectByFilter(filter: (node: Node) => boolean): void;

// 选择相同类型的节点
selectSameType(componentName: string): void;

// 选择父节点
selectParent(): void;

// 选择子节点
selectChildren(deep?: boolean): void;

// 选择兄弟节点
selectSiblings(): void;
```

### 3.4 范围选择

```typescript
// 选择范围内的节点
selectRange(from: Node, to: Node): void;

// 扩展选择到节点
extendTo(node: Node): void;

// 收缩选择
shrink(): void;

// 展开选择
expand(): void;
```

### 3.5 事件相关

```typescript
// 监听选择变化
onChange(fn: (ids: string[]) => void): IPublicTypeDisposable;

// 监听选择前
onSelecting(fn: (ids: string[]) => boolean | void): IPublicTypeDisposable;

// 监听选择后
onSelected(fn: (ids: string[]) => void): IPublicTypeDisposable;

// 监听清空
onClear(fn: () => void): IPublicTypeDisposable;
```

## 4. 核心原理

### 4.1 选择状态管理

```typescript
// 响应式选择列表
@obx.shallow private _selected: string[] = [];

// 计算属性：获取节点实例
@computed get selected(): Node[] {
  return this._selected
    .map(id => this.doc.getNode(id))
    .filter(Boolean);
}

// 计算属性：获取顶层节点
@computed get topNodes(): Node[] {
  const nodes = this.selected;
  return nodes.filter(node =>
    !nodes.some(other =>
      other !== node && other.contains(node)
    )
  );
}
```

### 4.2 选择算法

```typescript
// 单选逻辑
select(id: string) {
  // 触发选择前事件
  if (this.emitter.emit('selecting', [id]) === false) {
    return;
  }

  // 清空当前选择
  this._selected.length = 0;

  // 添加新选择
  this._selected.push(id);

  // 触发选择后事件
  this.emitter.emit('selectionchange', this._selected);
}

// 多选逻辑
add(ids: string[]) {
  const newIds = ids.filter(id => !this._selected.includes(id));
  if (newIds.length === 0) return;

  this._selected.push(...newIds);
  this.emitter.emit('selectionchange', this._selected);
}
```

### 4.3 框选实现

```typescript
// 框选算法
selectByRect(rect: IPublicTypeRect) {
  const nodes = this.doc.getNodes();
  const selected: string[] = [];

  nodes.forEach(node => {
    const nodeRect = node.getRect();
    if (this.isRectIntersect(rect, nodeRect)) {
      selected.push(node.id);
    }
  });

  this.select(selected);
}

// 矩形相交判断
isRectIntersect(rect1: Rect, rect2: Rect): boolean {
  return !(
    rect1.right < rect2.left ||
    rect1.left > rect2.right ||
    rect1.bottom < rect2.top ||
    rect1.top > rect2.bottom
  );
}
```

### 4.4 选择约束

```typescript
// 选择验证
private validateSelection(ids: string[]): string[] {
  return ids.filter(id => {
    const node = this.doc.getNode(id);
    if (!node) return false;

    // 检查节点是否可选
    if (node.isLocked) return false;
    if (node.isHidden) return false;

    // 检查选择权限
    const meta = node.componentMeta;
    if (meta.disableSelection) return false;

    return true;
  });
}
```

## 5. 选择模式

### 5.1 单选模式

```typescript
// 单选：每次只能选中一个节点
selection.select('node1'); // 选中 node1
selection.select('node2'); // 选中 node2，取消 node1
```

### 5.2 多选模式

```typescript
// 多选：可以选中多个节点
selection.select('node1');
selection.add('node2');    // node1, node2 都被选中
selection.add(['node3', 'node4']); // 添加更多节点
```

### 5.3 框选模式

```typescript
// 框选：通过矩形区域选择
selection.selectByRect({
  left: 100,
  top: 100,
  width: 200,
  height: 200
});
```

### 5.4 条件选择

```typescript
// 选择所有按钮
selection.selectByFilter(node =>
  node.componentName === 'Button'
);

// 选择可见节点
selection.selectByFilter(node =>
  !node.getPropValue('hidden')
);
```

## 6. 与其他模型的关系

### 6.1 与 DocumentModel 的关系
- Selection 属于特定的 Document
- Document 通过 selection 属性访问
- 文档切换时选择状态会重置

### 6.2 与 Node 的关系
- Selection 管理 Node 的选中状态
- Node 可查询自己是否被选中
- 节点删除时自动从选择中移除

### 6.3 与 Designer 的关系
- Designer 监听选择变化
- 通过 Designer 操作选择
- 选择变化触发设计器更新

### 6.4 与 Dragon 的关系
- 拖拽时使用当前选择
- 多选拖拽移动所有选中节点
- 拖拽结束更新选择状态

## 7. 使用方式

### 7.1 基础使用

```typescript
// 获取选择管理器
const selection = document.selection;

// 选中单个节点
selection.select('node_123');

// 选中多个节点
selection.select(['node_1', 'node_2', 'node_3']);

// 添加到选择
selection.add('node_4');

// 移除选择
selection.remove('node_2');

// 清空选择
selection.clear();
```

### 7.2 查询选择

```typescript
// 获取选中的节点
const nodes = selection.getNodes();

// 检查是否选中
if (selection.has('node_123')) {
  console.log('节点已选中');
}

// 获取选择数量
console.log(`选中了 ${selection.size} 个节点`);

// 获取第一个选中节点
const firstNode = selection.first;
```

### 7.3 高级选择

```typescript
// 选择父节点
selection.selectParent();

// 选择所有子节点
selection.selectChildren(true); // deep = true

// 选择相同类型
const node = selection.first;
if (node) {
  selection.selectSameType(node.componentName);
}

// 反选
selection.inverse();
```

### 7.4 事件监听

```typescript
// 监听选择变化
const dispose = selection.onChange((ids) => {
  console.log('选择变化:', ids);
  updatePropertyPanel(ids);
});

// 监听选择前（可以阻止选择）
selection.onSelecting((ids) => {
  // 返回 false 阻止选择
  if (ids.includes('locked_node')) {
    return false;
  }
});

// 清理监听
dispose();
```

## 8. 高级特性

### 8.1 智能选择

```typescript
// 智能选择扩展
class SmartSelection extends Selection {
  // 选择相似节点
  selectSimilar(node: Node) {
    const similar = this.findSimilarNodes(node);
    this.select(similar.map(n => n.id));
  }

  // 查找相似节点
  private findSimilarNodes(target: Node): Node[] {
    return this.doc.getNodes().filter(node => {
      // 相同组件类型
      if (node.componentName !== target.componentName) return false;

      // 相似属性
      const similarity = this.calculateSimilarity(node, target);
      return similarity > 0.8;
    });
  }

  // 计算相似度
  private calculateSimilarity(node1: Node, node2: Node): number {
    // 实现相似度算法...
    return 0.9;
  }
}
```

### 8.2 选择历史

```typescript
// 选择历史管理
class SelectionHistory {
  private history: string[][] = [];
  private cursor: number = -1;

  constructor(private selection: Selection) {
    selection.onChange(this.record.bind(this));
  }

  // 记录选择
  private record(ids: string[]) {
    // 删除当前位置之后的历史
    this.history = this.history.slice(0, this.cursor + 1);

    // 添加新记录
    this.history.push([...ids]);
    this.cursor++;

    // 限制历史长度
    if (this.history.length > 50) {
      this.history.shift();
      this.cursor--;
    }
  }

  // 后退
  back() {
    if (this.cursor > 0) {
      this.cursor--;
      this.selection.select(this.history[this.cursor]);
    }
  }

  // 前进
  forward() {
    if (this.cursor < this.history.length - 1) {
      this.cursor++;
      this.selection.select(this.history[this.cursor]);
    }
  }
}
```

### 8.3 选择分组

```typescript
// 选择分组管理
class SelectionGroup {
  private groups: Map<string, string[]> = new Map();

  // 保存选择组
  saveGroup(name: string, selection: Selection) {
    this.groups.set(name, selection.getIds());
  }

  // 恢复选择组
  loadGroup(name: string, selection: Selection) {
    const ids = this.groups.get(name);
    if (ids) {
      selection.select(ids);
    }
  }

  // 合并选择组
  mergeGroups(names: string[], selection: Selection) {
    const allIds = new Set<string>();
    names.forEach(name => {
      const ids = this.groups.get(name) || [];
      ids.forEach(id => allIds.add(id));
    });
    selection.select(Array.from(allIds));
  }
}
```

## 9. 注意事项

### 9.1 性能优化
- 大量节点选择时使用批量操作
- 避免频繁的选择变更
- 使用顶层节点过滤优化

### 9.2 状态同步
- 确保选择状态与节点状态同步
- 节点删除时自动更新选择
- 处理节点不可选的情况

### 9.3 用户体验
- 提供视觉反馈
- 支持键盘操作
- 保持选择的连续性

### 9.4 边界情况
- 处理空选择
- 处理无效节点ID
- 处理节点层级变化

## 10. 最佳实践

### 10.1 选择操作封装

```typescript
// 选择操作管理器
class SelectionManager {
  constructor(private selection: Selection) {}

  // 选择组件及其子组件
  selectWithChildren(nodeId: string) {
    const node = this.selection.doc.getNode(nodeId);
    if (!node) return;

    const ids = [nodeId];
    const collectChildren = (parent: Node) => {
      parent.children?.forEach(child => {
        ids.push(child.id);
        collectChildren(child);
      });
    };

    collectChildren(node);
    this.selection.select(ids);
  }

  // 选择可见组件
  selectVisible() {
    this.selection.selectByFilter(node =>
      !node.getPropValue('hidden') &&
      !node.getPropValue('condition') === false
    );
  }

  // 选择已修改的组件
  selectModified() {
    this.selection.selectByFilter(node =>
      node.isModified()
    );
  }
}
```

### 10.2 快捷键支持

```typescript
// 快捷键处理
class SelectionHotkeys {
  constructor(
    private selection: Selection,
    private document: DocumentModel
  ) {
    this.bindHotkeys();
  }

  private bindHotkeys() {
    // Ctrl+A 全选
    hotkey('ctrl+a', (e) => {
      e.preventDefault();
      this.selection.selectAll();
    });

    // Ctrl+D 取消选择
    hotkey('ctrl+d', (e) => {
      e.preventDefault();
      this.selection.clear();
    });

    // Tab 选择下一个
    hotkey('tab', (e) => {
      e.preventDefault();
      this.selectNext();
    });

    // Shift+Tab 选择上一个
    hotkey('shift+tab', (e) => {
      e.preventDefault();
      this.selectPrev();
    });
  }

  private selectNext() {
    const current = this.selection.first;
    if (current) {
      const next = current.nextSibling ||
                   current.parent?.children?.get(0);
      if (next) {
        this.selection.select(next.id);
      }
    }
  }
}
```

### 10.3 选择同步

```typescript
// 多视图选择同步
class SelectionSync {
  private views: Map<string, Selection> = new Map();
  private syncing = false;

  // 添加视图
  addView(id: string, selection: Selection) {
    this.views.set(id, selection);

    selection.onChange((ids) => {
      if (!this.syncing) {
        this.syncToOthers(id, ids);
      }
    });
  }

  // 同步到其他视图
  private syncToOthers(sourceId: string, ids: string[]) {
    this.syncing = true;

    this.views.forEach((selection, viewId) => {
      if (viewId !== sourceId) {
        selection.select(ids);
      }
    });

    this.syncing = false;
  }
}
```
