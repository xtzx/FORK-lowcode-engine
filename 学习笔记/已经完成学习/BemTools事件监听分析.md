# BemTools 事件监听分析 - 低代码引擎事件处理机制详解

## 1. 事件概述

基于对 `engine-core.js` 源码的分析，结合 BemTools 设计辅助工具的功能，低代码引擎监听和处理以下核心事件：

### 1.1 核心事件列表

| 事件名称 | 事件常量 | 触发时机 | 处理目标 |
|---------|---------|---------|---------|
| `detectingChange` | `DETECTING_CHANGE_EVENT` | 鼠标悬停节点变化时 | BorderDetecting 悬停边框 |
| `selectionchange` | - | 节点选择状态变化时 | BorderSelecting 选中边框 |
| `dragstart` | - | 拖拽开始时 | InsertionView 插入指示器 |
| `drag` | - | 拖拽进行中 | 位置跟踪和指示器更新 |
| `dragend` | - | 拖拽结束时 | 清理状态和视觉反馈 |

## 2. 悬停检测事件 (`detectingChange`)

### 2.1 事件监听设置

```typescript
// 在 designer 初始化时设置鼠标悬停监听
var hover = function hover(e) {
  // 检查是否启用了鼠标事件传播或正在拖拽
  if (!engineConfig.get('enableMouseEventPropagationInCanvas', false) || dragon.dragging) {
    e.stopPropagation();
  }
};

doc.addEventListener('mouseover', hover, true);
doc.addEventListener('mouseleave', leave, false);
```

### 2.2 事件触发机制

```typescript
// Detecting 类中的 capture 方法
capture(node) {
  if (this._current !== node) {
    this._current = node;
    this.emitter.emit(DETECTING_CHANGE_EVENT, this.current);
  }
}

// release 方法
release(node) {
  if (this._current === node) {
    this._current = null;
    this.emitter.emit(DETECTING_CHANGE_EVENT, this.current);
  }
}
```

### 2.3 BorderDetecting 响应处理

```typescript
// BorderDetecting 组件通过 @observer 装饰器自动响应
@computed get current() {
  var doc = host.currentDocument;
  if (!doc) return null;

  var selection = doc.selection;
  var current = host.designer.detecting.current;

  // 如果当前悬停节点已经被选中，则不显示悬停边框
  if (!current || current.document !== doc || selection.has(current.id)) {
    return null;
  }

  return current;
}
```

**处理效果**：
- 显示蓝色悬停边框
- 显示组件名称和基本信息
- 提供组件操作按钮
- 避免与选中状态冲突

## 3. 选择变更事件 (`selectionchange`)

### 3.1 事件触发场景

```typescript
// Selection 类中的多个方法都会触发此事件
select(id) {
  this._selected = [id];
  this.emitter.emit('selectionchange', this._selected);
}

add(id) {
  this._selected.push(id);
  this.emitter.emit('selectionchange', this._selected);
}

clear() {
  this._selected = [];
  this.emitter.emit('selectionchange', this._selected);
}

remove(id) {
  var i = this._selected.indexOf(id);
  if (i > -1) {
    this._selected.splice(i, 1);
    this.emitter.emit('selectionchange', this._selected);
  }
}
```

### 3.2 Designer 级别的监听

```typescript
// Designer 构造函数中设置选择变更监听
this.selectionDispose = currentSelection.onSelectionChange(function () {
  _this.postEvent('selection.change', currentSelection);
});
```

### 3.3 BorderSelecting 响应处理

```typescript
// BorderSelecting 通过 MobX 响应式机制自动更新
// 当 selection 状态变化时，自动重新渲染选中边框
```

**处理效果**：
- 显示橙色选中边框
- 显示多选状态
- 提供组件操作菜单
- 显示上下文相关的快捷操作

## 4. 拖拽事件系列 (`dragstart`, `drag`, `dragend`)

### 4.1 拖拽开始 (`dragstart`)

```typescript
// Designer 中监听拖拽开始
this.dragon.onDragstart(function (e) {
  var _this$props;

  // 禁用悬停检测
  _this.detecting.enable = false;

  var dragObject = e.dragObject;

  // 处理节点选择逻辑
  if (isDragNodeObject(dragObject)) {
    if (dragObject.nodes.length === 1) {
      if (dragObject.nodes[0].parent) {
        dragObject.nodes[0].select();
      } else {
        _this.currentSelection?.clear();
      }
    }
  } else {
    _this.currentSelection?.clear();
  }

  // 触发外部回调和事件
  if (_this.props?.onDragstart) {
    _this.props.onDragstart(e);
  }
  _this.postEvent('dragstart', e);
});
```

**处理效果**：
- 禁用悬停检测避免干扰
- 清理或更新选择状态
- 准备拖拽相关的视觉辅助

### 4.2 拖拽进行中 (`drag`)

```typescript
// Dragon 类中的 drag 方法
var drag = function drag(e) {
  var locateEvent = createLocateEvent(e);
  var location = _this2.locate(locateEvent);

  if (location) {
    designer.setLocation(location);
  } else {
    designer.clearLocation();
  }

  _this2.emitter.emit('drag', locateEvent);
};
```

**处理效果**：
- InsertionView 实时跟踪鼠标位置
- 显示绿色/红色插入指示器
- 智能判断插入规则和位置

### 4.3 拖拽结束 (`dragend`)

```typescript
// Designer 中监听拖拽结束
this.dragon.onDragend(function (e) {
  var dragObject = e.dragObject;
  var loc = _this._dropLocation;

  // 处理节点插入逻辑
  if (loc) {
    if (isLocationChildrenDetail(loc.detail) && loc.detail.valid !== false) {
      var nodes;
      if (isDragNodeObject(dragObject)) {
        nodes = insertChildren(loc.target, ...dragObject.nodes, loc.detail.index, copy);
      } else if (isDragNodeDataObject(dragObject)) {
        // 处理新组件数据
      }
    }
  }

  // 重新启用悬停检测
  _this.detecting.enable = true;

  // 触发事件
  _this.postEvent('dragend', e, loc);
});
```

**处理效果**：
- 执行实际的节点插入操作
- 恢复悬停检测功能
- 清理拖拽相关的视觉状态

## 5. DragGhost 拖拽幽灵组件的事件监听

```typescript
// DragGhost 组件监听拖拽事件提供视觉反馈
this.dispose = [
  this.dragon.onDragstart(function (e) {
    if (e.originalEvent.type.slice(0, 4) === 'drag') {
      return;
    }
    _this.titles = _this.getTitles(e.dragObject);
    _this.x = e.globalX;
    _this.y = e.globalY;
  }),

  this.dragon.onDrag(function (e) {
    _this.x = e.globalX;
    _this.y = e.globalY;
    // 检查是否为绝对布局容器
    if (isSimulatorHost(e.sensor)) {
      var container = e.sensor.getDropContainer(e);
      if (container?.container.componentMeta.advanced.isAbsoluteLayoutContainer) {
        _this.isAbsoluteLayoutContainer = true;
        return;
      }
    }
    _this.isAbsoluteLayoutContainer = false;
  }),

  this.dragon.onDragend(function () {
    _this.titles = null;
    _this.x = 0;
    _this.y = 0;
  })
];
```

**处理效果**：
- 显示拖拽时的组件标题
- 跟随鼠标移动
- 根据容器类型调整显示

## 6. Tree 大纲面板的事件监听

```typescript
// TreeView 组件中的悬停处理
hover(e) {
  var project = this.props.tree.pluginContext.project;
  var detecting = project.currentDocument?.detecting;

  if (detecting?.enable) {
    return;
  }

  var node = this.getTreeNodeFromEvent(e)?.node;
  node?.id && detecting?.capture(node.id);
}
```

**处理效果**：
- 大纲面板悬停时同步高亮画布组件
- 与主画布的悬停检测协调工作

## 7. 事件优化机制

### 7.1 事件防抖和性能优化

```typescript
// 使用 MobX @observer 装饰器实现自动响应
@observer
class BorderDetecting extends Component {
  @computed get current() {
    // 计算属性自动缓存，只在依赖变化时重新计算
  }
}
```

### 7.2 事件冲突处理

```typescript
// 拖拽时禁用悬停检测
this.dragon.onDragstart(function (e) {
  _this.detecting.enable = false;  // 禁用
});

this.dragon.onDragend(function (e) {
  _this.detecting.enable = true;   // 重新启用
});
```

### 7.3 条件渲染优化

```typescript
// 只在设计模式下渲染 BemTools
render() {
  const { host } = this.props;

  // 根据模式和配置决定是否渲染
  if (host.designMode !== 'design') {
    return null;
  }

  return (
    <div className="lc-bem-tools">
      {/* 各种辅助工具组件 */}
    </div>
  );
}
```

## 8. 事件协调机制总结

### 8.1 事件优先级

1. **拖拽事件** > 悬停事件（拖拽时禁用悬停）
2. **选中事件** > 悬停事件（选中节点不显示悬停边框）
3. **模式控制** > 所有事件（非设计模式不显示任何辅助工具）

### 8.2 状态同步

- 使用 **MobX 响应式系统** 确保状态变化自动更新UI
- 通过 **EventBus 事件总线** 实现模块间解耦通信
- 使用 **computed 计算属性** 优化性能，避免不必要的重计算

### 8.3 内存管理

```typescript
// 组件卸载时清理事件监听
componentWillUnmount() {
  this.dispose.forEach(fn => fn());
  this.selectionDispose?.();
}
```

## 9. 总结

低代码引擎通过精心设计的事件系统，实现了 BemTools 设计辅助工具的核心功能：

1. **响应式更新**：通过 MobX 和事件总线实现自动响应
2. **状态协调**：不同工具间避免冲突，保持一致的用户体验
3. **性能优化**：条件渲染、计算缓存、事件防抖等多重优化
4. **扩展性**：通过 BemToolsManager 支持自定义辅助工具

这套事件机制为用户提供了直观、流畅的可视化设计体验，是低代码引擎用户体验的重要保障。
