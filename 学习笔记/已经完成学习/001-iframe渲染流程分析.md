# iframe 渲染流程分析

## 概述

`packages/designer/src/builtin-simulator/host-view.tsx` 是低代码引擎中负责渲染编辑态 iframe 页面的核心组件。它通过创建独立的 iframe 环境，为低代码组件提供了一个隔离的运行和渲染环境。

## 核心组件结构

### 1. BuiltinSimulatorHostView（入口组件）
- **位置**：`packages/designer/src/builtin-simulator/host-view.tsx`
- **职责**：作为模拟器的顶层容器，管理 BuiltinSimulatorHost 实例
- **主要功能**：
  - 创建或获取 BuiltinSimulatorHost 实例
  - 传递 props 给 host 实例
  - 渲染 Canvas 组件

### 2. Canvas 组件
- **职责**：设备外壳层，通过背景图片模拟真实设备
- **主要功能**：
  - 应用设备样式（deviceStyle）
  - 设置设备 className（deviceClassName）
  - 包含 viewport 视口区域

### 3. Content 组件
- **职责**：管理 iframe 的创建和挂载
- **核心功能**：
  - 创建 iframe 元素
  - 处理缩放（scale）
  - 控制事件启用/禁用
  - 调用 `mountContentFrame` 挂载 iframe

## 代码执行流程

### 流程图

```
1. DesignerView 渲染
   └── ProjectView 组件渲染
       └── BuiltinSimulatorHostView 组件创建
           ├── 创建/获取 BuiltinSimulatorHost 实例
           └── Canvas 组件渲染
               └── Content 组件渲染
                   ├── 创建 iframe 元素
                   └── 调用 host.mountContentFrame(iframe)
                       ├── 设置 iframe 的 contentWindow 和 contentDocument
                       ├── 构建资源列表（buildLibrary）
                       ├── 调用 createSimulator 注入依赖
                       │   ├── 注入全局变量（AliLowCodeEngine、LCSimulatorHost）
                       │   ├── 解析资源列表（CSS、JS）
                       │   ├── 写入 HTML 结构
                       │   └── 等待 SimulatorRenderer 加载
                       ├── 等待组件消费（componentsConsumer.waitFirstConsume）
                       ├── 等待运行时上下文（injectionConsumer.waitFirstConsume）
                       ├── 执行 renderer.run() 开始渲染
                       └── 设置事件监听（setupEvents）
```

### 详细执行步骤

#### 步骤1：引擎初始化
- **文件**：`packages/designer/src/designer/designer-view.tsx`
- **函数**：`DesignerView.render()`
- **动作**：渲染 ProjectView 组件，传入 designer 实例

#### 步骤2：项目视图渲染
- **文件**：`packages/designer/src/project/project-view.tsx`
- **函数**：`ProjectView.render()`
- **动作**：
  - 获取 Simulator 组件（默认为 BuiltinSimulatorHostView）
  - 渲染 Simulator 组件，传入 simulatorProps

#### 步骤3：创建模拟器主机
- **文件**：`packages/designer/src/builtin-simulator/host-view.tsx`
- **函数**：`BuiltinSimulatorHostView.constructor()`
- **动作**：
  - 创建或获取 BuiltinSimulatorHost 实例
  - 设置 props
  - 触发 onMount 回调

#### 步骤4：渲染 Canvas 和 Content
- **文件**：`packages/designer/src/builtin-simulator/host-view.tsx`
- **函数**：`Canvas.render()` 和 `Content.render()`
- **动作**：
  - Canvas 设置设备样式
  - Content 创建 iframe 元素
  - iframe 设置 name 属性：`${viewName}-SimulatorRenderer`

#### 步骤5：挂载 iframe
- **文件**：`packages/designer/src/builtin-simulator/host.ts`
- **函数**：`BuiltinSimulatorHost.mountContentFrame()`
- **关键动作**：
  ```javascript
  // 1. 保存 iframe 引用
  this._iframe = iframe;
  this._contentWindow = iframe.contentWindow;
  this._contentDocument = this._contentWindow.document;

  // 2. 构建资源列表
  const libraryAsset = this.buildLibrary();

  // 3. 准备依赖资源
  const vendors = [
    assetBundle(environment, AssetLevel.Environment),
    assetBundle(extraEnvironment, AssetLevel.Environment),
    assetBundle(libraryAsset, AssetLevel.Library),
    assetBundle(theme, AssetLevel.Theme),
    assetBundle(simulatorUrl, AssetLevel.Runtime)
  ];

  // 4. 创建模拟器
  const renderer = await createSimulator(this, iframe, vendors);

  // 5. 等待必要条件
  await this.componentsConsumer.waitFirstConsume();
  await this.injectionConsumer.waitFirstConsume();

  // 6. 开始渲染
  renderer.run();

  // 7. 设置事件监听
  this.setupEvents();
  ```

#### 步骤6：创建模拟器
- **文件**：`packages/designer/src/builtin-simulator/create-simulator.ts`
- **函数**：`createSimulator()`
- **动作**：
  ```javascript
  // 1. 注入全局变量
  win.AliLowCodeEngine = innerPlugins._getLowCodePluginContext({});
  win.LCSimulatorHost = host;

  // 2. 解析资源列表，生成 HTML 片段
  parseAssetList(vendors);

  // 3. 写入 iframe 文档
  doc.write(`
    <!doctype html>
    <html class="engine-design-mode">
      <head>
        <meta charset="utf-8"/>
        ${styleFrags}
      </head>
      <body>
        ${scriptFrags}
      </body>
    </html>
  `);

  // 4. 等待 SimulatorRenderer 加载完成
  return new Promise((resolve) => {
    const renderer = win.SimulatorRenderer;
    if (renderer) {
      return resolve(renderer);
    }
    // 监听 load 事件
    win.addEventListener('load', () => {
      resolve(win.SimulatorRenderer);
    });
  });
  ```

#### 步骤7：设置事件处理
- **文件**：`packages/designer/src/builtin-simulator/host.ts`
- **函数**：`BuiltinSimulatorHost.setupEvents()`
- **动作**：
  - 设置拖拽和点击事件（setupDragAndClick）
  - 设置元素检测（setupDetecting）
  - 设置实时编辑（setupLiveEditing）
  - 设置右键菜单（setupContextMenu）

## 关键特性

### 1. 资源管理
- 通过 AssetLevel 分层管理资源（Environment、Library、Theme、Runtime）
- 支持同步和异步资源加载

### 2. 事件隔离
- iframe 提供独立的运行环境
- 通过 disabledEvents 状态控制事件启用/禁用

### 3. 缩放支持
- Content 组件通过 transform: scale() 实现画布缩放
- viewport 管理缩放比例和内容尺寸

### 4. 热键和剪贴板
- 将热键系统挂载到 iframe 的 contentWindow
- 注入剪贴板功能到 iframe 的 contentDocument

## 注意事项

1. **iframe 挂载时机**：只有当 iframe 元素真正存在且与之前的不同时，才会执行挂载流程
2. **异步等待**：渲染前需要等待组件消费和运行时上下文就绪
3. **资源加载顺序**：严格按照 Environment → Library → Theme → Runtime 的顺序加载
4. **事件系统**：所有与画布的交互事件都需要在 iframe 内部处理
