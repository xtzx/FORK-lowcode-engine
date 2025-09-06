# History - 历史记录模型详解

## 1. 模型概述

`History` 是低代码引擎中管理操作历史的模型，实现了撤销（undo）和重做（redo）功能。它记录用户的每一次操作，允许用户回退到之前的状态或重新执行已撤销的操作，是提升用户体验的重要功能。

## 2. 核心属性

### 2.1 基础属性

```typescript
class History {
  // 所属文档
  document: DocumentModel;

  // 历史记录栈
  stack: HistoryRecord[] = [];

  // 当前位置
  cursor: number = -1;

  // 最大历史记录数
  maxSize: number = 100;

  // 是否启用
  enabled: boolean = true;

  // 是否正在执行操作
  working: boolean = false;
}
```

### 2.2 状态属性

```typescript
{
  // 保存点位置
  savePoint: number = -1;

  // 是否有修改（相对于保存点）
  modified: boolean;

  // 是否可以撤销
  canUndo: boolean;

  // 是否可以重做
  canRedo: boolean;

  // 当前状态
  state: 'idle' | 'undoing' | 'redoing';
}
```

### 2.3 配置选项

```typescript
interface HistoryOptions {
  // 最大历史记录数
  maxSize?: number;

  // 是否自动保存
  autoSave?: boolean;

  // 保存延迟时间
  saveDelay?: number;

  // 是否合并连续操作
  mergeContinuous?: boolean;

  // 合并时间窗口
  mergeWindow?: number;
}
```

## 3. 核心方法

### 3.1 基础操作

```typescript
// 撤销
undo(): void;

// 重做
redo(): void;

// 记录操作
record(name: string, data?: any): void;

// 清空历史
clear(): void;

// 设置保存点
setSavePoint(): void;

// 重置到保存点
resetToSavePoint(): void;
```

### 3.2 状态查询

```typescript
// 是否可以撤销
canUndo(): boolean;

// 是否可以重做
canRedo(): boolean;

// 是否有修改
isModified(): boolean;

// 获取历史记录数量
getSize(): number;

// 获取当前位置
getCursor(): number;

// 获取历史记录列表
getRecords(): HistoryRecord[];
```

### 3.3 高级操作

```typescript
// 批量操作
batch(fn: () => void, name?: string): void;

// 静默操作（不记录历史）
silent(fn: () => void): void;

// 跳转到指定位置
goto(index: number): void;

// 合并最近的操作
merge(count: number): void;

// 获取操作描述
getDescription(index: number): string;
```

### 3.4 事件相关

```typescript
// 监听变化
onChange(fn: (event: HistoryChangeEvent) => void): IPublicTypeDisposable;

// 监听撤销
onUndo(fn: (record: HistoryRecord) => void): IPublicTypeDisposable;

// 监听重做
onRedo(fn: (record: HistoryRecord) => void): IPublicTypeDisposable;

// 监听记录
onRecord(fn: (record: HistoryRecord) => void): IPublicTypeDisposable;
```

## 4. 核心原理

### 4.1 历史记录结构

```typescript
interface HistoryRecord {
  // 唯一标识
  id: string;

  // 操作名称
  name: string;

  // 时间戳
  timestamp: number;

  // 操作前状态
  before: any;

  // 操作后状态
  after: any;

  // 附加数据
  data?: any;

  // 是否可合并
  mergeable?: boolean;
}
```

### 4.2 撤销/重做机制

```typescript
// 撤销实现
undo() {
  if (!this.canUndo()) return;

  this.working = true;
  const record = this.stack[this.cursor];

  try {
    // 恢复到操作前状态
    this.restore(record.before);
    this.cursor--;
    this.emitChange('undo', record);
  } finally {
    this.working = false;
  }
}

// 重做实现
redo() {
  if (!this.canRedo()) return;

  this.working = true;
  const record = this.stack[this.cursor + 1];

  try {
    // 恢复到操作后状态
    this.restore(record.after);
    this.cursor++;
    this.emitChange('redo', record);
  } finally {
    this.working = false;
  }
}
```

### 4.3 状态快照机制

```typescript
// 创建快照
createSnapshot(): any {
  return {
    schema: this.document.export(),
    selection: this.document.selection.export(),
    detecting: this.document.detecting.export()
  };
}

// 恢复快照
restoreSnapshot(snapshot: any) {
  this.document.import(snapshot.schema);
  this.document.selection.import(snapshot.selection);
  this.document.detecting.import(snapshot.detecting);
}
```

### 4.4 操作合并策略

```typescript
// 判断是否可合并
canMerge(record1: HistoryRecord, record2: HistoryRecord): boolean {
  // 时间窗口检查
  if (record2.timestamp - record1.timestamp > this.mergeWindow) {
    return false;
  }

  // 操作类型检查
  if (record1.name !== record2.name) {
    return false;
  }

  // 标记检查
  if (!record1.mergeable || !record2.mergeable) {
    return false;
  }

  return true;
}

// 合并操作
mergeRecords(records: HistoryRecord[]): HistoryRecord {
  return {
    id: records[0].id,
    name: records[0].name,
    timestamp: records[0].timestamp,
    before: records[0].before,
    after: records[records.length - 1].after,
    data: records.map(r => r.data),
    mergeable: true
  };
}
```

## 5. 操作类型

### 5.1 节点操作

```typescript
// 节点创建
history.record('create-node', {
  nodeId: node.id,
  parentId: parent.id,
  index: 0
});

// 节点删除
history.record('delete-node', {
  nodeId: node.id,
  parentId: parent.id,
  index: node.index
});

// 节点移动
history.record('move-node', {
  nodeId: node.id,
  fromParent: oldParent.id,
  toParent: newParent.id,
  fromIndex: oldIndex,
  toIndex: newIndex
});
```

### 5.2 属性操作

```typescript
// 属性修改
history.record('update-prop', {
  nodeId: node.id,
  propPath: 'style.color',
  oldValue: '#000',
  newValue: '#fff'
});

// 批量属性修改
history.batch(() => {
  node.setPropValue('title', '新标题');
  node.setPropValue('visible', true);
  node.setPropValue('style.color', '#333');
}, 'update-props');
```

### 5.3 结构操作

```typescript
// 页面导入
history.record('import-page', {
  oldSchema: oldSchema,
  newSchema: newSchema
});

// 组件替换
history.record('replace-component', {
  nodeId: node.id,
  oldComponentName: 'Button',
  newComponentName: 'Link'
});
```

## 6. 与其他模型的关系

### 6.1 与 DocumentModel 的关系
- History 属于特定的 Document
- Document 的所有操作都会记录到 History
- History 通过 Document 恢复状态

### 6.2 与 Node 的关系
- 记录 Node 的创建、删除、移动等操作
- 保存 Node 的状态快照
- 恢复时重建 Node 结构

### 6.3 与 Selection 的关系
- 记录选择状态的变化
- 撤销/重做时恢复选择状态
- 保持用户操作的连贯性

## 7. 使用方式

### 7.1 基础使用

```typescript
// 获取历史管理器
const history = document.history;

// 执行撤销
if (history.canUndo()) {
  history.undo();
}

// 执行重做
if (history.canRedo()) {
  history.redo();
}

// 设置保存点
history.setSavePoint();

// 检查是否有修改
if (history.isModified()) {
  console.log('文档已修改');
}
```

### 7.2 记录操作

```typescript
// 记录简单操作
history.record('delete-node');

// 记录带数据的操作
history.record('update-node', {
  nodeId: node.id,
  changes: {
    title: '新标题',
    visible: true
  }
});

// 批量操作
history.batch(() => {
  // 多个操作会合并为一条历史记录
  nodes.forEach(node => {
    node.remove();
  });
}, 'batch-delete');
```

### 7.3 静默操作

```typescript
// 不记录历史的操作
history.silent(() => {
  // 这些操作不会被记录
  node.setPropValue('_temp', true);
  node.setPropValue('_cache', data);
});

// 临时禁用历史
history.enabled = false;
// 执行操作...
history.enabled = true;
```

### 7.4 高级功能

```typescript
// 跳转到指定历史
const records = history.getRecords();
history.goto(5); // 跳转到第5条记录

// 合并最近的操作
history.merge(3); // 合并最近3条记录

// 监听历史变化
history.onChange((event) => {
  console.log('历史变化:', event.type, event.record);
  updateUndoRedoButtons();
});
```

## 8. 高级特性

### 8.1 智能合并

```typescript
// 智能合并相似操作
class SmartHistory extends History {
  record(name: string, data?: any) {
    const lastRecord = this.stack[this.cursor];

    // 文本输入合并
    if (name === 'text-input' && lastRecord?.name === 'text-input') {
      if (this.canMergeTextInput(lastRecord, data)) {
        lastRecord.after = this.createSnapshot();
        lastRecord.data = data;
        return;
      }
    }

    // 样式修改合并
    if (name === 'style-change' && lastRecord?.name === 'style-change') {
      if (this.canMergeStyleChange(lastRecord, data)) {
        lastRecord.after = this.createSnapshot();
        lastRecord.data = { ...lastRecord.data, ...data };
        return;
      }
    }

    super.record(name, data);
  }
}
```

### 8.2 选择性记录

```typescript
// 配置哪些操作需要记录
const historyConfig = {
  recordable: {
    'create-node': true,
    'delete-node': true,
    'update-prop': true,
    'move-node': true,
    'resize-node': false, // 不记录缩放
    'hover-node': false   // 不记录悬停
  },

  // 属性过滤
  propFilter: (propName: string) => {
    // 不记录私有属性
    if (propName.startsWith('_')) return false;
    // 不记录临时属性
    if (propName.includes('temp')) return false;
    return true;
  }
};
```

### 8.3 历史压缩

```typescript
// 历史记录压缩
class CompressedHistory extends History {
  compress() {
    // 移除冗余记录
    this.removeRedundant();

    // 合并连续相同操作
    this.mergeContinuous();

    // 压缩大对象
    this.compressLargeObjects();
  }

  private removeRedundant() {
    // 移除被完全覆盖的操作
    // 例如：创建后立即删除的节点
  }

  private compressLargeObjects() {
    // 使用差分算法压缩大对象
    this.stack.forEach(record => {
      if (this.isLargeObject(record.before)) {
        record.before = this.createDiff(record.before, record.after);
      }
    });
  }
}
```

## 9. 注意事项

### 9.1 性能优化
- 限制历史记录数量，避免内存溢出
- 大对象使用差分存储
- 频繁操作考虑合并策略

### 9.2 内存管理
- 及时清理过期的历史记录
- 避免在快照中存储大对象引用
- 使用弱引用处理临时数据

### 9.3 一致性保证
- 确保快照的完整性
- 处理撤销/重做的异常情况
- 避免在操作过程中修改历史

### 9.4 用户体验
- 提供操作描述便于用户理解
- 合理设置合并窗口时间
- 保持撤销粒度的合理性

## 10. 最佳实践

### 10.1 操作命名规范

```typescript
// 使用语义化的操作名称
const HistoryActionNames = {
  // 节点操作
  CREATE_NODE: 'create-node',
  DELETE_NODE: 'delete-node',
  MOVE_NODE: 'move-node',
  COPY_NODE: 'copy-node',

  // 属性操作
  UPDATE_PROP: 'update-prop',
  UPDATE_STYLE: 'update-style',
  UPDATE_EVENT: 'update-event',

  // 结构操作
  IMPORT_SCHEMA: 'import-schema',
  CLEAR_PAGE: 'clear-page',
  REORDER_CHILDREN: 'reorder-children'
};
```

### 10.2 批量操作优化

```typescript
// 批量操作管理器
class BatchOperationManager {
  constructor(private history: History) {}

  // 批量删除
  batchDelete(nodes: Node[]) {
    if (nodes.length === 0) return;

    const description = nodes.length === 1
      ? `删除 ${nodes[0].title}`
      : `删除 ${nodes.length} 个组件`;

    this.history.batch(() => {
      nodes.forEach(node => node.remove());
    }, description);
  }

  // 批量更新
  batchUpdate(updates: Array<{ node: Node; props: any }>) {
    this.history.batch(() => {
      updates.forEach(({ node, props }) => {
        Object.entries(props).forEach(([key, value]) => {
          node.setPropValue(key, value);
        });
      });
    }, `更新 ${updates.length} 个组件`);
  }
}
```

### 10.3 历史记录持久化

```typescript
// 历史记录持久化
class PersistentHistory extends History {
  private storageKey: string;

  constructor(document: DocumentModel) {
    super(document);
    this.storageKey = `history_${document.id}`;
    this.load();
  }

  // 保存到本地存储
  save() {
    const data = {
      stack: this.stack.slice(0, this.cursor + 1),
      cursor: this.cursor,
      savePoint: this.savePoint
    };
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  // 从本地存储加载
  load() {
    const data = localStorage.getItem(this.storageKey);
    if (data) {
      const { stack, cursor, savePoint } = JSON.parse(data);
      this.stack = stack;
      this.cursor = cursor;
      this.savePoint = savePoint;
    }
  }

  // 清理存储
  clear() {
    super.clear();
    localStorage.removeItem(this.storageKey);
  }
}
```
