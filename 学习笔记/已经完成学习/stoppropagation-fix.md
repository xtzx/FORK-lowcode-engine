# `stopPropagation()` 无效的原因及解决方案

## 问题分析

### 为什么 `stopPropagation()` 不起作用？

低代码引擎在**捕获阶段**（capture phase）监听mousedown事件：

```typescript
// packages/designer/src/builtin-simulator/host.ts:668
doc.addEventListener('mousedown', (downEvent: MouseEvent) => {
  // 引擎的事件处理逻辑
}, true); // true = 捕获阶段
```

### 事件传播阶段

```
捕获阶段 (Capture Phase) ← 引擎监听器在这里
    ↓
目标阶段 (Target Phase)
    ↓
冒泡阶段 (Bubbling Phase) ← stopPropagation() 只阻止这里
```

**关键问题**：`stopPropagation()` 只阻止**冒泡阶段**的事件传播，但不影响**捕获阶段**的监听器。

## 解决方案

### 方案一：使用捕获阶段阻止传播

#### 1. 在组件上添加捕获阶段监听器

```typescript
class CustomComponent extends React.Component {
  componentDidMount() {
    // 在捕获阶段监听，优先于引擎
    this.containerRef?.addEventListener('mousedown', this.handleMouseDownCapture, true);
  }

  componentWillUnmount() {
    this.containerRef?.removeEventListener('mousedown', this.handleMouseDownCapture, true);
  }

  handleMouseDownCapture = (e: MouseEvent) => {
    // 检查是否是需要避免的元素
    if (this.shouldAvoidEngineDrag(e.target as HTMLElement)) {
      e.stopPropagation();  // 在捕获阶段阻止传播
      e.preventDefault();

      // 处理您的自定义逻辑
      this.handleCustomDrag(e);
    }
  };

  shouldAvoidEngineDrag = (element: HTMLElement): boolean => {
    return element?.classList.contains('custom-drag-handle') ||
           element?.closest('.avoid-engine-drag') !== null;
  };

  render() {
    return (
      <div ref={ref => this.containerRef = ref}>
        <div className="custom-drag-handle">
          拖拽手柄
        </div>
      </div>
    );
  }
}
```

#### 2. 结合React事件系统

```typescript
class CustomComponent extends React.Component {
  handleMouseDownCapture = (e: React.MouseEvent) => {
    // 在React的捕获阶段处理
    if (this.shouldAvoidEngineDrag(e.target as HTMLElement)) {
      e.stopPropagation();
      e.preventDefault();

      // 处理自定义逻辑
      this.handleCustomDrag(e.nativeEvent);
    }
  };

  render() {
    return (
      <div onMouseDownCapture={this.handleMouseDownCapture}>
        <div className="custom-drag-handle">
          拖拽手柄
        </div>
      </div>
    );
  }
}
```

### 方案二：使用事件委托在document级别

#### 1. 全局事件拦截

```typescript
class CustomComponent extends React.Component {
  componentDidMount() {
    // 在document级别捕获阶段监听
    document.addEventListener('mousedown', this.handleGlobalMouseDown, true);
  }

  componentWillUnmount() {
    document.removeEventListener('mousedown', this.handleGlobalMouseDown, true);
  }

  handleGlobalMouseDown = (e: MouseEvent) => {
    // 检查事件目标是否在当前组件内
    if (this.containerRef?.contains(e.target as Node) &&
        this.shouldAvoidEngineDrag(e.target as HTMLElement)) {

      e.stopPropagation();
      e.preventDefault();

      // 处理自定义逻辑
      this.handleCustomDrag(e);
    }
  };

  render() {
    return (
      <div ref={ref => this.containerRef = ref}>
        <div className="avoid-engine-drag">
          可拖拽区域
        </div>
      </div>
    );
  }
}
```

### 方案三：使用组件元数据钩子（最可靠）

#### 1. onMouseDownHook 回调

```typescript
// 在组件元数据中配置
{
  componentName: 'CustomDragComponent',
  configure: {
    advanced: {
      callbacks: {
        onMouseDownHook: (e: MouseEvent, currentNode: any) => {
          // 检查事件目标
          const target = e.target as HTMLElement;

          if (target?.classList.contains('custom-drag-handle') ||
              target?.closest('.avoid-engine-drag')) {

            // 阻止引擎处理
            e.stopPropagation();
            e.preventDefault();

            // 禁用引擎事件
            if (window.parent?.AliLowCodeEngine?.editor) {
              window.parent.AliLowCodeEngine.editor.eventBus.emit(
                'designer.builtinSimulator.disabledEvents', true
              );
            }

            // 处理自定义逻辑
            handleCustomMouseDown(e);

            return false; // 明确告诉引擎不要处理
          }

          return true; // 让引擎正常处理其他情况
        }
      }
    }
  }
}
```

### 方案四：修改事件监听器顺序

#### 1. 使用setTimeout延迟执行

```typescript
class CustomComponent extends React.Component {
  handleMouseDown = (e: React.MouseEvent) => {
    // 先阻止冒泡
    e.stopPropagation();
    e.preventDefault();

    // 使用setTimeout确保在引擎处理之后执行
    setTimeout(() => {
      // 检查引擎是否已经添加了类
      if (document.documentElement.classList.contains('lc-cursor-dragging')) {
        // 如果已经添加了，立即移除
        if (window.parent?.AliLowCodeEngine?.editor) {
          window.parent.AliLowCodeEngine.editor.eventBus.emit(
            'designer.builtinSimulator.disabledEvents', false
          );
        }
      }
    }, 0);
  };
}
```

### 方案五：使用MutationObserver监控DOM变化

#### 1. 实时监控类变化

```typescript
class CustomComponent extends React.Component {
  private observer: MutationObserver | null = null;

  componentDidMount() {
    // 监控HTML元素的class变化
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const htmlElement = mutation.target as HTMLElement;

          // 如果添加了lc-cursor-dragging类
          if (htmlElement.classList.contains('lc-cursor-dragging') &&
              this.shouldRemoveDraggingClass()) {

            // 立即移除
            htmlElement.classList.remove('lc-cursor-dragging');
          }
        }
      });
    });

    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  componentWillUnmount() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  shouldRemoveDraggingClass = (): boolean => {
    // 检查当前是否在您的自定义拖拽过程中
    return this.state.isCustomDragging;
  };
}
```

## 最佳实践

### 1. 多层防护策略

```typescript
class RobustCustomComponent extends React.Component {
  componentDidMount() {
    // 第一层：document级别捕获
    document.addEventListener('mousedown', this.handleGlobalCapture, true);

    // 第二层：组件级别捕获
    this.containerRef?.addEventListener('mousedown', this.handleLocalCapture, true);

    // 第三层：DOM监控
    this.setupClassObserver();
  }

  handleGlobalCapture = (e: MouseEvent) => {
    if (this.containerRef?.contains(e.target as Node)) {
      e.stopPropagation();
      this.handleCustomDrag(e);
    }
  };

  handleLocalCapture = (e: MouseEvent) => {
    e.stopPropagation();
    this.handleCustomDrag(e);
  };

  setupClassObserver = () => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const html = mutation.target as HTMLElement;
          if (html.classList.contains('lc-cursor-dragging') && this.state.isCustomDragging) {
            html.classList.remove('lc-cursor-dragging');
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
  };

  handleCustomDrag = (e: MouseEvent) => {
    this.setState({ isCustomDragging: true });

    // 通知引擎禁用事件
    if (window.parent?.AliLowCodeEngine?.editor) {
      window.parent.AliLowCodeEngine.editor.eventBus.emit(
        'designer.builtinSimulator.disabledEvents', true
      );
    }

    // 您的自定义拖拽逻辑
    this.startCustomDrag(e);
  };

  handleDragEnd = () => {
    this.setState({ isCustomDragging: false });

    // 恢复引擎事件
    if (window.parent?.AliLowCodeEngine?.editor) {
      window.parent.AliLowCodeEngine.editor.eventBus.emit(
        'designer.builtinSimulator.disabledEvents', false
      );
    }
  };
}
```

### 2. 调试和验证

#### 检查事件传播

```javascript
// 添加调试监听器
document.addEventListener('mousedown', (e) => {
  console.log('Event phase:', e.eventPhase);
  console.log('Current target:', e.currentTarget);
  console.log('Target:', e.target);
  console.log('Stopped:', e.isPropagationStopped?.() || 'N/A');
}, true); // 捕获阶段

document.addEventListener('mousedown', (e) => {
  console.log('Bubbling phase - Event phase:', e.eventPhase);
}, false); // 冒泡阶段
```

#### 监控类变化

```javascript
// 监控HTML class变化
const classObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === 'class') {
      console.log('HTML class changed:', mutation.target.className);
      console.log('Added classes:', Array.from(mutation.target.classList));
    }
  });
});

classObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class']
});
```

## 总结

### 核心原因
- 引擎在**捕获阶段**监听事件
- `stopPropagation()` 只阻止**冒泡阶段**传播
- 捕获阶段的事件监听器仍然会触发

### 解决方案优先级
1. **捕获阶段拦截** - 最有效，在document或组件级别使用捕获监听器
2. **组件元数据钩子** - 最可靠，使用`onMouseDownHook`返回`false`
3. **MutationObserver监控** - 作为最后防线，监控并移除 unwanted 类
4. **事件委托** - 灵活但需要小心处理

### 关键要点
- 使用 `addEventListener` 的第三个参数 `true` 来在捕获阶段监听
- 在捕获阶段调用 `stopPropagation()` 可以阻止后续所有阶段
- 结合 `onMouseDownHook` 可以确保引擎完全不处理特定事件
- 使用MutationObserver可以作为fallback机制

通过这些方法，您可以确保在特定的DOM元素上完全避免触发低代码引擎的拖拽处理逻辑。

