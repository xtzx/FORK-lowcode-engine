# NodeChildren - 子节点集合模型详解

## 1. 模型概述

`NodeChildren` 是低代码引擎中管理节点子元素的集合模型。它负责维护父节点与子节点之间的关系，提供子节点的增删改查功能，并确保节点树结构的完整性和一致性。

## 2. 核心属性

### 2.1 基础属性

```typescript
class NodeChildren {
  // 所属节点（父节点）
  owner: Node;

  // 子节点数组
  children: Node[] = [];

  // 子节点数量（计算属性）
  size: number;

  // 长度别名（计算属性）
  length: number;

  // 是否为空
  isEmpty: boolean;
}
```

### 2.2 配置选项

```typescript
interface NodeChildrenOptions {
  // 是否静音（不触发事件）
  mute?: boolean;

  // 是否重新计算索引
  reindex?: boolean;

  // 是否检查嵌套规则
  checkNesting?: boolean;
}
```

## 3. 核心方法

### 3.1 基础操作

```typescript
// 获取子节点
get(index: number): Node | null;

// 判断是否存在
has(node: Node | string): boolean;

// 获取节点索引
indexOf(node: Node): number;

// 遍历子节点
forEach(fn: (node: Node, index: number) => void): void;

// 映射子节点
map<T>(fn: (node: Node, index: number) => T): T[];

// 过滤子节点
filter(fn: (node: Node, index: number) => boolean): Node[];

// 查找子节点
find(fn: (node: Node, index: number) => boolean): Node | undefined;

// 部分子节点
some(fn: (node: Node, index: number) => boolean): boolean;

// 所有子节点
every(fn: (node: Node, index: number) => boolean): boolean;
```

### 3.2 插入操作

```typescript
// 在指定位置插入
insert(node: Node, index?: number, options?: NodeChildrenOptions): void;

// 在节点前插入
insertBefore(node: Node, ref: Node, options?: NodeChildrenOptions): void;

// 在节点后插入
insertAfter(node: Node, ref: Node, options?: NodeChildrenOptions): void;

// 追加到末尾
append(node: Node, options?: NodeChildrenOptions): void;

// 前置到开头
prepend(node: Node, options?: NodeChildrenOptions): void;
```

### 3.3 删除操作

```typescript
// 删除指定节点
delete(node: Node, options?: NodeChildrenOptions): boolean;

// 删除指定索引的节点
deleteAt(index: number, options?: NodeChildrenOptions): boolean;

// 清空所有子节点
clear(options?: NodeChildrenOptions): void;

// 批量删除
deleteRange(start: number, end: number, options?: NodeChildrenOptions): void;
```

### 3.4 移动与替换

```typescript
// 移动节点位置
move(node: Node, targetIndex: number): void;

// 替换节点
replace(oldNode: Node, newNode: Node, options?: NodeChildrenOptions): void;

// 交换两个节点位置
swap(node1: Node, node2: Node): void;

// 反转子节点顺序
reverse(): void;
```

### 3.5 导入导出

```typescript
// 导入子节点
import(data: IPublicTypeNodeData[], options?: NodeChildrenOptions): Node[];

// 导出子节点
export(stage?: IPublicEnumTransformStage): IPublicTypeNodeData[];

// 合并子节点
merge(nodes: Node[], options?: NodeChildrenOptions): void;

// 拆分子节点
split(index: number): [Node[], Node[]];
```

## 4. 核心原理

### 4.1 数据结构

```typescript
// 内部维护一个响应式数组
@obx.shallow children: Node[] = [];

// 通过 MobX 实现响应式更新
@computed get size() {
  return this.children.length;
}
```

### 4.2 索引管理

```typescript
// 自动维护子节点索引
private reindex() {
  this.children.forEach((child, index) => {
    child.index = index;
  });
}

// 插入时更新后续节点索引
private updateIndices(startIndex: number) {
  for (let i = startIndex; i < this.children.length; i++) {
    this.children[i].index = i;
  }
}
```

### 4.3 父子关系维护

```typescript
// 添加子节点时建立关系
private establish(child: Node) {
  child._parent = this.owner;
  child.document = this.owner.document;
}

// 移除子节点时断开关系
private disconnect(child: Node) {
  child._parent = null;
}
```

### 4.4 嵌套规则检查

```typescript
// 检查是否可以插入
private checkNesting(child: Node): boolean {
  const parentMeta = this.owner.componentMeta;
  const childMeta = child.componentMeta;

  // 检查父节点是否接受此子节点
  if (!parentMeta.checkNestingDown(child)) {
    return false;
  }

  // 检查子节点是否可以放入父节点
  if (!childMeta.checkNestingUp(this.owner)) {
    return false;
  }

  return true;
}
```

## 5. 事件机制

### 5.1 事件类型

```typescript
enum NodeChildrenEvent {
  Insert = 'insert',
  Remove = 'remove',
  Replace = 'replace',
  Move = 'move',
  Clear = 'clear'
}
```

### 5.2 事件触发

```typescript
// 插入时触发
this.owner.emitter.emit('node-children-change', {
  type: 'insert',
  node: child,
  index: index
});

// 删除时触发
this.owner.emitter.emit('node-children-change', {
  type: 'remove',
  node: child,
  index: oldIndex
});
```

## 6. 与其他模型的关系

### 6.1 与 Node 的关系
- NodeChildren 是 Node 的属性
- 只有容器节点才有 NodeChildren
- 通过 owner 引用父节点

### 6.2 与 Document 的关系
- 子节点继承父节点的 document
- 文档负责节点的创建和销毁
- 通过文档进行节点ID管理

### 6.3 与 Selection 的关系
- 删除子节点时更新选择状态
- 移动节点时保持选择状态
- 批量操作时优化选择更新

## 7. 使用方式

### 7.1 基础操作

```typescript
// 获取子节点集合
const children = parentNode.children;

// 添加子节点
children.append(newNode);

// 插入到指定位置
children.insert(newNode, 2);

// 删除子节点
children.delete(oldNode);

// 遍历子节点
children.forEach(child => {
  console.log(child.componentName);
});
```

### 7.2 批量操作

```typescript
// 批量添加
const nodes = schemas.map(schema => document.createNode(schema));
children.merge(nodes);

// 批量删除
const toDelete = children.filter(child => child.getPropValue('deprecated'));
toDelete.forEach(node => children.delete(node));

// 清空所有
children.clear();
```

### 7.3 查询操作

```typescript
// 查找特定节点
const button = children.find(child =>
  child.componentName === 'Button'
);

// 过滤节点
const visibleNodes = children.filter(child =>
  !child.getPropValue('hidden')
);

// 检查是否包含
if (children.has(targetNode)) {
  console.log('包含目标节点');
}
```

### 7.4 位置操作

```typescript
// 移动到指定位置
children.move(node, 0); // 移到最前

// 交换位置
children.swap(node1, node2);

// 反转顺序
children.reverse();

// 根据条件排序
const sorted = [...children.children].sort((a, b) =>
  a.getPropValue('order') - b.getPropValue('order')
);
children.clear();
children.merge(sorted);
```

## 8. 高级特性

### 8.1 事务操作

```typescript
// 批量操作优化
children.transaction(() => {
  children.delete(node1);
  children.insert(node2, 0);
  children.append(node3);
}); // 只触发一次更新
```

### 8.2 条件过滤

```typescript
// 获取可见子节点
const visibleChildren = children.filter(child => {
  const condition = child.getPropValue('condition');
  return condition !== false;
});
```

### 8.3 深度操作

```typescript
// 递归获取所有后代节点
function getAllDescendants(node: Node): Node[] {
  const result: Node[] = [];

  node.children?.forEach(child => {
    result.push(child);
    result.push(...getAllDescendants(child));
  });

  return result;
}
```

## 9. 注意事项

### 9.1 性能考虑
- 大量子节点时使用批量操作
- 避免在循环中频繁操作
- 使用事务减少重渲染次数

### 9.2 内存管理
- 删除节点会递归删除所有子节点
- 注意清理事件监听器
- 避免节点间的循环引用

### 9.3 一致性保证
- 始终通过 API 操作，不要直接修改数组
- 注意维护索引的正确性
- 检查嵌套规则避免非法结构

### 9.4 并发安全
- NodeChildren 操作不是线程安全的
- 避免在异步回调中直接操作
- 使用锁或队列处理并发修改

## 10. 最佳实践

### 10.1 安全的插入操作

```typescript
function safeInsert(parent: Node, child: Node, index?: number) {
  // 检查父节点是否为容器
  if (!parent.isContainer()) {
    throw new Error('Parent is not a container');
  }

  // 检查嵌套规则
  if (!parent.document.checkNesting(parent, child)) {
    throw new Error('Nesting rule violation');
  }

  // 检查是否会造成循环
  if (child.contains(parent)) {
    throw new Error('Circular reference detected');
  }

  parent.children.insert(child, index);
}
```

### 10.2 高效的批量更新

```typescript
// 使用事务包装批量操作
function batchUpdate(parent: Node, updates: Array<{
  action: 'insert' | 'delete' | 'move';
  node: Node;
  index?: number;
}>) {
  parent.children.transaction(() => {
    updates.forEach(({ action, node, index }) => {
      switch (action) {
        case 'insert':
          parent.children.insert(node, index);
          break;
        case 'delete':
          parent.children.delete(node);
          break;
        case 'move':
          parent.children.move(node, index!);
          break;
      }
    });
  });
}
```

### 10.3 条件渲染的子节点管理

```typescript
// 管理条件渲染的子节点
class ConditionalChildren {
  constructor(private node: Node) {}

  getVisibleChildren() {
    return this.node.children.filter(child => {
      const condition = child.condition;
      if (typeof condition === 'boolean') {
        return condition;
      }
      if (condition?.type === 'JSExpression') {
        return this.evaluateCondition(condition.value);
      }
      return true;
    });
  }

  private evaluateCondition(expression: string): boolean {
    // 条件表达式求值逻辑
    return true;
  }
}
```
