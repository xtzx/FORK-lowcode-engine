# `disableDetecting` 配置使用指南

## 配置概述

`disableDetecting` 是低代码引擎的一个配置选项，用于**控制组件悬停检测和边框显示功能**。

## 配置方法

### 1. 全局配置

```typescript
// 在引擎初始化时设置
const engine = new Engine({
  disableDetecting: true,  // 禁用悬停检测
  // ... 其他配置
});
```

### 2. 运行时动态设置

```typescript
// 通过 engineConfig 设置
import { engineConfig } from '@alilc/lowcode-editor-core';

engineConfig.set('disableDetecting', true);
```

### 3. 组件级别配置

```typescript
// 在组件元数据中设置
{
  componentName: 'MyComponent',
  configure: {
    advanced: {
      // 此组件特有的配置
    }
  }
}
```

## 功能影响

### 禁用时 (disableDetecting: true)

#### ✅ 仍然正常工作
- **组件拖拽**: 基础的拖拽功能仍然可用
- **组件选择**: 点击选择组件仍然可用
- **组件编辑**: 双击编辑等功能仍然可用
- **右键菜单**: 上下文菜单仍然可用

#### ❌ 被禁用的功能
- **悬停边框**: 鼠标悬停时不再显示组件边框
- **悬停检测**: 不再触发 `detecting.capture()`
- **视觉反馈**: 失去悬停时的视觉提示
- **BorderDetecting组件**: 不再渲染悬停边框

### 启用时 (disableDetecting: false) - 默认值

#### ✅ 完整功能
- **悬停检测**: 鼠标悬停时检测当前组件
- **边框显示**: 显示悬停组件的边框
- **状态同步**: 与大纲树等组件同步悬停状态
- **性能影响**: 会产生额外的DOM操作和事件处理

## 工作原理

### 1. 配置检查逻辑

```typescript
// packages/designer/src/builtin-simulator/bem-tools/index.tsx
{ !engineConfig.get('disableDetecting') && <BorderDetecting key="hovering" host={host} /> }
```

当 `disableDetecting` 为 `true` 时，`BorderDetecting` 组件不会被渲染。

### 2. 悬停检测逻辑

```typescript
// packages/designer/src/builtin-simulator/host.ts
const hover = (e: MouseEvent) => {
  if (!detecting.enable || this.designMode !== 'design') {
    return;  // 检测被跳过
  }
  // ... 悬停处理逻辑
};
```

### 3. detecting.enable 的影响

`disableDetecting` 配置**不直接影响** `detecting.enable`，但会影响：

- `BorderDetecting` 组件的渲染
- 悬停时的视觉反馈
- 与其他组件的状态同步

## 使用场景

### 1. 性能优化场景

```typescript
// 在组件较多、性能敏感的场景下禁用
const engine = new Engine({
  disableDetecting: true,  // 减少不必要的DOM操作
});
```

### 2. 自定义悬停处理

```typescript
// 如果您实现了自己的悬停检测逻辑
const engine = new Engine({
  disableDetecting: true,  // 禁用默认的悬停检测
});

// 然后实现自己的悬停处理
class CustomHoverHandler {
  handleMouseOver(e: MouseEvent) {
    // 您的自定义悬停逻辑
  }
}
```

### 3. 无头模式 (Headless Mode)

```typescript
// 在无界面模式下完全禁用视觉反馈
const engine = new Engine({
  disableDetecting: true,
  // ... 其他无头模式配置
});
```

## 实际效果演示

### 禁用前 (disableDetecting: false)
```javascript
// 鼠标悬停在组件上时：
// 1. 组件显示蓝色边框
// 2. 大纲树中对应节点高亮
// 3. 触发 detecting.capture(node)
// 4. 产生相应的DOM更新
```

### 禁用后 (disableDetecting: true)
```javascript
// 鼠标悬停在组件上时：
// 1. 无视觉边框显示
// 2. 大纲树无高亮效果
// 3. detecting.capture() 不被触发
// 4. 减少DOM操作，提升性能
```

## 注意事项

### 1. 默认行为
- **默认值**: `false`（启用悬停检测）
- **推荐**: 在大多数场景下保持启用
- **性能**: 禁用可提升复杂页面的性能

### 2. 功能依赖
- **不影响拖拽**: 禁用后仍可正常拖拽组件
- **不影响选择**: 禁用后仍可正常选择组件
- **不影响编辑**: 禁用后仍可正常编辑组件

### 3. 组合使用
```typescript
const engine = new Engine({
  disableDetecting: true,           // 禁用悬停检测
  enableCanvasLock: false,          // 其他相关配置
  hideComponentAction: true,        // 隐藏组件操作栏
});
```

## 调试验证

### 1. 检查配置状态

```javascript
// 在浏览器控制台检查
import { engineConfig } from '@alilc/lowcode-editor-core';
console.log('disableDetecting:', engineConfig.get('disableDetecting'));
```

### 2. 检查组件渲染

```javascript
// 检查 BorderDetecting 组件是否存在
const borderDetecting = document.querySelector('.lc-borders-detecting');
console.log('BorderDetecting rendered:', !!borderDetecting);
```

### 3. 监控悬停事件

```javascript
// 监听 detecting 状态变化
const detecting = window.AliLowCodeEngine?.editor?.detecting;
if (detecting) {
  detecting.onDetectingChange((node) => {
    console.log('Detecting changed:', node?.componentName);
  });
}
```

## 总结

`disableDetecting: true` 的作用是：

1. **禁用悬停边框显示** - 不再显示鼠标悬停时的蓝色边框
2. **跳过悬停检测逻辑** - 减少不必要的DOM操作和事件处理
3. **提升性能** - 特别是在组件数量多的页面中效果明显
4. **保持核心功能** - 拖拽、选择、编辑等功能仍然正常

这是一个**纯视觉和性能优化的配置**，不会影响编辑器的核心交互功能。

