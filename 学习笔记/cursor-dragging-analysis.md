# `lc-cursor-dragging` 类添加机制分析

## 问题描述

您发现渲染的iframe页面在内部拖拽时，HTML元素会自动添加`lc-cursor-dragging`类，但无法确定此逻辑的实现位置。

## 实现机制

### 1. 核心类：Cursor

**文件位置**: `packages/utils/src/cursor.ts`

```typescript
export class Cursor {
  private states = new Set<string>();

  setDragging(flag: boolean) {
    if (flag) {
      this.addState('dragging');  // 添加 dragging 状态
    } else {
      this.removeState('dragging'); // 移除 dragging 状态
    }
  }

  addState(state: string) {
    if (!this.states.has(state)) {
      this.states.add(state);
      // 关键代码：给 html 元素添加类
      document.documentElement.classList.add(`lc-cursor-${state}`);
    }
  }

  private removeState(state: string) {
    if (this.states.has(state)) {
      this.states.delete(state);
      // 移除类
      document.documentElement.classList.remove(`lc-cursor-${state}`);
    }
  }
}
```

### 2. CSS样式定义

**文件位置**: `packages/utils/src/cursor.css`

```css
html.lc-cursor-dragging,
html.lc-cursor-dragging * {
  cursor: move !important;  /* 设置鼠标为移动样式 */
}
```

### 3. 触发链路

#### 3.1 入口点：用户鼠标按下

**文件位置**: `packages/designer/src/builtin-simulator/host.ts:652-659`

当用户在组件上按下鼠标左键时：

```typescript
designer.dragon.boost(
  {
    type: IPublicEnumDragObjectType.Node,
    nodes,
  },
  downEvent,  // 鼠标按下事件
  isRGLNode ? rglNode : undefined,
);
```

#### 3.2 Dragon类处理

**文件位置**: `packages/designer/src/designer/dragon.ts:513`

```typescript
// 如果是原生拖拽事件
if (isDragEvent(boostEvent)) {
  // ... 处理 dataTransfer
  dragstart();  // 调用开始拖拽
} else {
  this.setNativeSelection(false);
}
```

#### 3.3 拖拽开始

**文件位置**: `packages/designer/src/designer/dragon.ts:294-303`

```typescript
const dragstart = () => {
  this._dragging = true;
  setShaken(boostEvent);
  const locateEvent = createLocateEvent(boostEvent);
  if (newBie || forceCopyState) {
    this.setCopyState(true);
  } else {
    chooseSensor(locateEvent);
  }
  // 关键调用：设置拖拽状态
  this.setDraggingState(true);
  // ... 其他处理
};
```

#### 3.4 设置拖拽状态

**文件位置**: `packages/designer/src/designer/dragon.ts:574-579`

```typescript
private setDraggingState(state: boolean) {
  cursor.setDragging(state);  // 调用全局cursor实例
  this.getSimulators().forEach((sim) => {
    sim?.setDraggingState(state);  // 通知所有模拟器
  });
}
```

#### 3.5 模拟器响应

**文件位置**: `packages/react-simulator-renderer/src/renderer.ts:424-426`

```typescript
setDraggingState(state: boolean) {
  cursor.setDragging(state);  // iframe内的cursor实例也会被调用
}
```

## 触发条件

### 1. 鼠标事件条件
- **左键按下**: `downEvent.which === 1 || downEvent.button === 0`
- **非多选模式**: 非Ctrl/Cmd键按下
- **非RGL特殊处理**: 普通组件拖拽（非网格布局）

### 2. 组件选择条件
- **非焦点节点**: `focusNode && !node.contains(focusNode)`
- **有效节点**: 非Page组件或Live模式下的Page子节点

### 3. 排除条件
- **右键菜单**: `downEvent.which !== 3`
- **表单控件**: 非`isFormEvent(e)`的元素
- **特殊选择器**: 非配置的忽略选择器匹配元素

## 事件流程图

```
用户鼠标按下 (mousedown)
    ↓
host.ts: mousedown事件处理
    ↓
检查是否为拖拽条件 (isLeftButton && focusNode && !node.contains(focusNode))
    ↓
调用 designer.dragon.boost()
    ↓
dragon.ts: boost() 方法
    ↓
如果是原生拖拽事件，调用 dragstart()
    ↓
dragstart() → this.setDraggingState(true)
    ↓
setDraggingState() → cursor.setDragging(true)
    ↓
cursor.addState('dragging') → document.documentElement.classList.add('lc-cursor-dragging')
    ↓
CSS样式生效：cursor: move !important
```

## 影响范围

### 1. 样式影响
- **全局生效**: HTML元素及其所有子元素
- **优先级最高**: 使用`!important`强制覆盖
- **鼠标样式**: 所有元素显示为`move`光标

### 2. 功能影响
- **视觉反馈**: 用户知道正在拖拽组件
- **用户体验**: 提供拖拽状态的视觉指示
- **样式覆盖**: 可能覆盖组件自定义的鼠标样式

## 清理机制

### 1. 自动清理
**文件位置**: `packages/designer/src/designer/dragon.ts:394-400`

拖拽结束时自动清理：

```typescript
if (this._dragging) {
  this._dragging = false;
  try {
    this.emitter.emit('dragend', { dragObject, copy });
  } catch (ex) {
    exception = ex;
  }
}
```

### 2. 异常情况处理
- **ESC键取消**: 监听`keydown`事件，ESC键取消拖拽
- **页面异常**: 如果拖拽过程中断，可能需要手动清理

### 3. 清理方法

```typescript
// 手动清理
cursor.release();  // 清理所有状态

// 或指定清理
cursor.setDragging(false);
```

## 调试方法

### 1. 检查当前状态

```javascript
// 在浏览器控制台执行
console.log('Dragging state:', document.documentElement.classList.contains('lc-cursor-dragging'));

// 查看cursor实例状态
console.log('Cursor states:', window.cursor?.states);
```

### 2. 监听状态变化

```javascript
// 监听class变化
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      console.log('HTML class changed:', mutation.target.className);
    }
  });
});

observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class']
});
```

### 3. 跟踪调用栈

```javascript
// 在cursor.setDragging处添加断点
// 或在console中重写方法
const originalSetDragging = window.cursor.setDragging;
window.cursor.setDragging = function(flag) {
  console.trace('setDragging called with:', flag);
  return originalSetDragging.call(this, flag);
};
```

## 扩展使用

### 1. 自定义状态

```typescript
// 添加自定义拖拽状态
cursor.addState('custom-dragging');
```

### 2. 条件性设置

```typescript
// 只在特定条件下设置拖拽状态
if (shouldShowDraggingCursor) {
  cursor.setDragging(true);
}
```

### 3. 清理特定状态

```typescript
// 只清理拖拽状态，不影响其他状态
cursor.setDragging(false);
```

## 总结

`lc-cursor-dragging`类的添加是通过以下链路实现的：

1. **用户操作**: 在组件上按下鼠标左键
2. **事件处理**: `host.ts`中的mousedown事件处理
3. **拖拽启动**: `dragon.boost()`方法调用
4. **状态设置**: `dragon.setDraggingState(true)`调用
5. **样式应用**: `cursor.setDragging(true)` → HTML添加`lc-cursor-dragging`类
6. **CSS生效**: `cursor.css`中的样式规则生效

这个机制为用户提供了拖拽过程中的视觉反馈，同时也可能影响组件的自定义鼠标样式。

