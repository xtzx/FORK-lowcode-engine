# 避免 `lc-cursor-dragging` 类触发的解决方案

## 问题分析

根据代码分析，`lc-cursor-dragging` 类的添加是通过以下链路触发的：

```
用户鼠标按下 (mousedown)
    ↓
host.ts: mousedown事件处理 → 检查拖拽条件
    ↓
designer.dragon.boost() → 启动拖拽流程
    ↓
cursor.setDragging(true) → 添加HTML类
```

要避免在特定DOM上触发，需要在链路的早期阶段阻止事件传播或处理。

## 解决方案

### 方案一：使用组件元数据回调（推荐）

#### 1. 阻止鼠标按下事件处理

```typescript
// 在组件元数据中添加回调
{
  componentName: 'YourCustomComponent',
  configure: {
    advanced: {
      callbacks: {
        // 阻止引擎处理鼠标按下事件
        onMouseDownHook: (e: MouseEvent, currentNode: any) => {
          // 检查事件目标是否是您要避免的DOM
          const target = e.target as HTMLElement;

          if (this.isAvoidDragElement(target)) {
            // 阻止事件继续传播
            e.stopPropagation();
            e.preventDefault();

            // 处理您自己的拖拽逻辑
            this.handleCustomDrag(e);

            // 返回false阻止引擎处理
            return false;
          }

          // 其他情况让引擎正常处理
          return true;
        },

        // 也可以阻止移动相关的处理
        onMoveHook: (currentNode: any) => {
          // 在您的自定义拖拽过程中返回false
          if (this.isCustomDragging()) {
            return false;
          }
          return true;
        }
      }
    }
  }
}
```

#### 2. 实用工具函数

```typescript
class YourCustomComponent extends React.Component {
  private isCustomDragging = false;

  // 检查是否是需要避免拖拽的元素
  isAvoidDragElement = (element: HTMLElement): boolean => {
    return element?.classList.contains('custom-drag-handle') ||
           element?.closest('.avoid-engine-drag') !== null ||
           element?.hasAttribute('data-avoid-engine-drag');
  };

  // 处理自定义拖拽
  handleCustomDrag = (e: MouseEvent) => {
    this.isCustomDragging = true;

    // 禁用引擎的事件处理
    this.disableEngineEvents();

    // 启动您的自定义拖拽逻辑
    this.startCustomDrag(e);
  };

  // 禁用引擎事件处理
  disableEngineEvents = () => {
    if (window.parent?.AliLowCodeEngine?.editor) {
      window.parent.AliLowCodeEngine.editor.eventBus.emit(
        'designer.builtinSimulator.disabledEvents',
        true
      );
    }
  };

  // 启用引擎事件处理
  enableEngineEvents = () => {
    if (window.parent?.AliLowCodeEngine?.editor) {
      window.parent.AliLowCodeEngine.editor.eventBus.emit(
        'designer.builtinSimulator.disabledEvents',
        false
      );
    }
  };

  handleDragEnd = () => {
    this.isCustomDragging = false;
    this.enableEngineEvents();
  };
}
```

### 方案二：DOM属性和事件委托

#### 1. 使用特殊属性标记

```typescript
class CustomComponent extends React.Component {
  handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 检查是否是需要避免的元素
    if (target.hasAttribute('data-avoid-engine-drag') ||
        target.closest('[data-avoid-engine-drag]')) {

      // 阻止事件冒泡
      e.stopPropagation();

      // 处理自定义逻辑
      this.handleCustomMouseDown(e.nativeEvent);
      return;
    }

    // 其他情况正常处理
  };

  render() {
    return (
      <div onMouseDown={this.handleMouseDown}>
        {/* 普通元素 */}
        <div>Normal Element</div>

        {/* 避免引擎处理的元素 */}
        <div data-avoid-engine-drag>
          <CustomDragHandle />
        </div>

        {/* 或者使用CSS类 */}
        <div className="avoid-engine-drag">
          <CustomDragHandle />
        </div>
      </div>
    );
  }
}
```

#### 2. 全局事件拦截

```typescript
// 在组件挂载时添加全局事件监听器
componentDidMount() {
  // 在捕获阶段监听，避免被引擎的事件处理器先处理
  document.addEventListener('mousedown', this.handleGlobalMouseDown, true);
}

componentWillUnmount() {
  document.removeEventListener('mousedown', this.handleGlobalMouseDown, true);
}

handleGlobalMouseDown = (e: MouseEvent) => {
  const target = e.target as HTMLElement;

  // 检查是否在您的组件范围内且需要避免引擎处理
  if (this.containerRef?.contains(target) &&
      this.shouldAvoidEngineDrag(target)) {

    e.stopPropagation();
    e.preventDefault();

    // 处理您的自定义逻辑
    this.handleCustomMouseDown(e);
  }
};
```

### 方案三：条件性事件绑定

#### 1. 动态控制事件监听

```typescript
class SmartComponent extends React.Component {
  private eventListenersAttached = false;

  componentDidMount() {
    this.attachConditionalListeners();
  }

  // 根据条件动态绑定事件监听器
  attachConditionalListeners() {
    if (this.shouldAvoidEngineDrag()) {
      // 绑定自定义事件处理器
      this.attachCustomDragHandlers();
    } else {
      // 移除自定义处理器，让引擎正常工作
      this.detachCustomDragHandlers();
    }
  }

  shouldAvoidEngineDrag(): boolean {
    // 检查当前是否需要避免引擎拖拽处理
    return this.props.customDragEnabled ||
           this.state.isInCustomMode;
  }

  attachCustomDragHandlers() {
    if (this.eventListenersAttached) return;

    // 添加自定义事件处理器
    this.containerRef?.addEventListener('mousedown', this.handleCustomMouseDown, true);
    this.containerRef?.addEventListener('mousemove', this.handleCustomMouseMove, true);
    this.containerRef?.addEventListener('mouseup', this.handleCustomMouseUp, true);

    this.eventListenersAttached = true;
  }

  detachCustomDragHandlers() {
    if (!this.eventListenersAttached) return;

    // 移除自定义事件处理器
    this.containerRef?.removeEventListener('mousedown', this.handleCustomMouseDown, true);
    this.containerRef?.removeEventListener('mousemove', this.handleCustomMouseMove, true);
    this.containerRef?.removeEventListener('mouseup', this.handleCustomMouseUp, true);

    this.eventListenersAttached = false;
  }

  handleCustomMouseDown = (e: MouseEvent) => {
    // 阻止事件冒泡到引擎
    e.stopPropagation();
    e.preventDefault();

    // 处理自定义拖拽逻辑
    this.startCustomDrag(e);
  };
}
```

### 方案四：CSS属性隔离

#### 1. 使用pointer-events控制

```css
/* 在拖拽开始时设置 */
.avoid-engine-drag.dragging {
  pointer-events: none;
}

/* 为拖拽手柄单独启用 */
.avoid-engine-drag.dragging .custom-handle {
  pointer-events: auto;
}
```

```typescript
class CSSTrickComponent extends React.Component {
  private isDragging = false;

  handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('custom-handle')) {
      this.isDragging = true;

      // 添加CSS类来改变pointer-events
      this.containerRef?.classList.add('dragging');

      // 禁用引擎事件
      this.disableEngineEvents();

      // 启动自定义拖拽
      this.startCustomDrag(e.nativeEvent);
    }
  };

  handleMouseUp = () => {
    if (this.isDragging) {
      this.isDragging = false;

      // 移除CSS类
      this.containerRef?.classList.remove('dragging');

      // 重新启用引擎事件
      this.enableEngineEvents();
    }
  };

  disableEngineEvents = () => {
    // 通知引擎禁用事件处理
    if (window.parent?.AliLowCodeEngine?.editor) {
      window.parent.AliLowCodeEngine.editor.eventBus.emit(
        'designer.builtinSimulator.disabledEvents',
        true
      );
    }
  };

  enableEngineEvents = () => {
    if (window.parent?.AliLowCodeEngine?.editor) {
      window.parent.AliLowCodeEngine.editor.eventBus.emit(
        'designer.builtinSimulator.disabledEvents',
        false
      );
    }
  };
}
```

### 方案五：组件级别隔离

#### 1. 完全接管组件事件

```typescript
class IsolatedComponent extends React.Component {
  // 标记这是一个隔离的组件，不受引擎影响
  static isolated = true;

  componentDidMount() {
    // 向引擎注册这个组件的隔离状态
    this.registerIsolation();
  }

  registerIsolation() {
    if (window.parent?.AliLowCodeEngine?.editor) {
      const editor = window.parent.AliLowCodeEngine.editor;

      // 注册组件隔离
      editor.eventBus.emit('component.isolation.register', {
        componentId: this.props.id,
        isolationType: 'drag',
        callback: this.handleIsolationRequest
      });
    }
  }

  handleIsolationRequest = (request: any) => {
    // 处理引擎的隔离请求
    if (request.type === 'drag-start') {
      // 返回false表示拒绝引擎的拖拽处理
      return false;
    }
    return true;
  };

  handleMouseDown = (e: React.MouseEvent) => {
    // 完全自定义的鼠标处理逻辑
    // 引擎不会收到这个事件
    this.handleCustomInteraction(e.nativeEvent);
  };

  render() {
    return (
      <div
        onMouseDown={this.handleMouseDown}
        data-engine-isolated="true"
      >
        {/* 您的自定义内容 */}
      </div>
    );
  }
}
```

## 最佳实践

### 1. 推荐方案组合

```typescript
// 组合使用多种方案确保可靠性
{
  componentName: 'RobustCustomComponent',
  configure: {
    advanced: {
      callbacks: {
        // 第一道防线：钩子函数
        onMouseDownHook: (e: MouseEvent, currentNode: any) => {
          return !this.shouldIsolateDrag(e);
        },

        onMoveHook: (currentNode: any) => {
          return !this.isIsolatedComponent(currentNode);
        }
      }
    }
  }
}

class RobustCustomComponent extends React.Component {
  // 第二道防线：DOM属性
  render() {
    return (
      <div data-avoid-engine-drag="true">
        <div className="custom-drag-handle">
          {/* 第三道防线：CSS类 */}
        </div>
      </div>
    );
  }

  // 第四道防线：事件委托
  componentDidMount() {
    this.setupEventDelegation();
  }

  setupEventDelegation() {
    this.containerRef?.addEventListener('mousedown', (e) => {
      if (this.isCustomDragElement(e.target as HTMLElement)) {
        e.stopPropagation();
        e.preventDefault();
        this.handleCustomDrag(e);
      }
    }, true); // 使用捕获阶段
  }
}
```

### 2. 调试和验证

#### 检查是否成功避免

```javascript
// 在拖拽时检查
const checkAvoidance = () => {
  const hasDraggingClass = document.documentElement.classList.contains('lc-cursor-dragging');
  const isEngineDisabled = window.parent?.AliLowCodeEngine?.editor?.eventBus;

  console.log('Dragging class present:', hasDraggingClass);
  console.log('Engine events disabled:', !isEngineDisabled);
};

// 监听事件
window.addEventListener('mousedown', (e) => {
  setTimeout(checkAvoidance, 100); // 延迟检查以等待引擎处理
});
```

#### 性能监控

```typescript
class PerformanceMonitoredComponent extends React.Component {
  private eventCount = 0;
  private lastEventTime = 0;

  componentDidMount() {
    // 监控事件处理性能
    this.setupPerformanceMonitoring();
  }

  setupPerformanceMonitoring() {
    const originalAddEventListener = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function(
      type: string,
      listener: any,
      options?: any
    ) {
      if (type === 'mousedown' && this instanceof HTMLElement) {
        const wrappedListener = (...args: any[]) => {
          const startTime = performance.now();
          const result = listener.apply(this, args);
          const endTime = performance.now();

          console.log(`MouseDown event took ${endTime - startTime}ms`);
          return result;
        };

        return originalAddEventListener.call(this, type, wrappedListener, options);
      }

      return originalAddEventListener.call(this, type, listener, options);
    };
  }
}
```

## 总结

避免 `lc-cursor-dragging` 类触发的核心策略是：

1. **早期拦截**: 在事件传播的早期阶段阻止事件到达引擎处理器
2. **多层防护**: 结合钩子函数、DOM属性、CSS类、事件委托等多种方法
3. **状态管理**: 正确管理引擎的事件禁用/启用状态
4. **性能考虑**: 避免过度的事件监听和处理

### 推荐优先级：

1. **组件元数据回调** (`onMouseDownHook`) - 最可靠
2. **DOM属性标记** (`data-avoid-engine-drag`) - 最简单
3. **事件委托** (捕获阶段) - 最灵活
4. **CSS pointer-events** - 辅助方案

通过这些方法，您可以在特定的DOM元素上完全控制拖拽行为，避免触发低代码引擎的 `lc-cursor-dragging` 类添加逻辑。

