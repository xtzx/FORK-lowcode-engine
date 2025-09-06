# WindowView 窗口视图管理详解

## 一、文件位置与基本信息

**文件路径**: `packages/workspace/src/view/window-view.tsx`

**核心作用**: WindowView 是 Workspace 多窗口架构中的**窗口视图管理器**，负责根据不同的窗口状态和资源类型，渲染相应的编辑器界面。

## 二、WindowView 在 Workspace 架构中的位置

### 架构层级关系
```
Workspace (多窗口管理器)
└── Workbench (工作台布局)
    └── WindowView (窗口视图) ←── 当前分析的组件
        ├── DesignerView (设计器视图)
        ├── ResourceView (资源视图)
        └── BuiltinLoading (加载视图)
```

### 使用位置
在 `packages/workspace/src/layouts/workbench.tsx` 第 60-67 行：

```tsx
{
  workspace.windows.map(d => (
    <WindowView
      active={d.id === workspace.window?.id}  // 是否为当前活动窗口
      window={d}                              // 窗口实例
      key={d.id}                             // 唯一标识
    />
  ))
}
```

## 三、WindowView 的核心功能

### 1. **窗口状态管理**
WindowView 根据窗口的不同状态进行条件渲染：

#### 状态一：未初始化状态
```tsx
if (!initReady) {
    const Loading = engineConfig.get('loadingComponent', BuiltinLoading);
    return (
        <div className={`workspace-engine-main ${active ? 'active' : ''}`}>
            <Loading />
        </div>
    );
}
```
- **条件**: `window.initReady === false`
- **行为**: 显示加载动画
- **场景**: 窗口正在初始化过程中

#### 状态二：WebView 模式
```tsx
if (resource.type === 'webview' && url) {
    return <DesignerView url={url} viewName={resource.name} />;
}
```
- **条件**: 资源类型为 `'webview'` 且有 URL
- **行为**: 渲染 `DesignerView` 组件
- **场景**: 加载外部网页作为编辑器界面

#### 状态三：普通编辑器模式
```tsx
return (
    <div className={`workspace-engine-main ${active ? 'active' : ''}`}>
        <ResourceView
            resource={resource}
            window={this.props.window}
        />
    </div>
);
```
- **条件**: 默认情况（通常是 `resource.type === 'editor'`）
- **行为**: 渲染 `ResourceView` 组件
- **场景**: 标准的低代码编辑器界面

### 2. **活动状态管理**
通过 `active` prop 控制窗口的激活状态：
- `active={d.id === workspace.window?.id}` 判断是否为当前活动窗口
- 通过 CSS 类名 `active` 控制界面显示效果

## 四、资源类型详解

根据代码分析，支持两种主要资源类型：

### 1. **editor 类型**
- **定义**: 本地编辑器资源
- **渲染**: 使用 `ResourceView` 组件
- **场景**:
  - 标准的低代码页面编辑器
  - 组件编辑器
  - 数据源编辑器
  - 其他内置编辑功能

### 2. **webview 类型**
- **定义**: 外部网页资源
- **渲染**: 使用 `DesignerView` 组件
- **场景**:
  - 嵌入第三方编辑工具
  - 自定义网页编辑器
  - 外部系统集成

## 五、多窗口管理机制

### 窗口实例管理
```typescript
// Workspace 类中
export class Workspace {
    windows: IEditorWindow[] = [];        // 所有窗口实例
    window: IEditorWindow;                // 当前活动窗口
    editorWindowMap: Map<string, IEditorWindow>; // 窗口映射表
}
```

### 窗口切换流程
1. **打开新窗口**: `workspace.openEditorWindow()`
2. **切换活动窗口**: 更新 `workspace.window`
3. **重新渲染**: Workbench 重新渲染所有 WindowView
4. **状态更新**: 只有活动窗口的 `active` 为 `true`

### 窗口生命周期
```typescript
class EditorWindow {
    async init() {
        // 1. 初始化资源
        await this.resource.init();

        // 2. 初始化编辑器视图
        await this.execViewTypesInit();

        // 3. 设置默认视图
        this.setDefaultViewName();

        // 4. 标记初始化完成
        this.initReady = true;
    }
}
```

## 六、使用场景分析

### 1. **标准低代码编辑器**
```json
{
  "resourceName": "page-editor",
  "type": "editor",
  "title": "页面编辑器"
}
```
- 渲染流程: WindowView → ResourceView → 页面编辑器界面

### 2. **第三方工具集成**
```json
{
  "resourceName": "external-tool",
  "type": "webview",
  "url": "https://external-editor.com",
  "title": "外部编辑工具"
}
```
- 渲染流程: WindowView → DesignerView → 嵌入外部网页

### 3. **多窗口切换**
```typescript
// 用户操作：点击不同标签页
workspace.switchToWindow(windowId);

// 系统响应：
// 1. 更新 workspace.window
// 2. 重新计算每个 WindowView 的 active 状态
// 3. 只有 active 窗口可见，其他隐藏
```

## 七、WindowView 的设计优势

### 1. **统一的窗口管理**
- 所有类型的编辑器都通过统一的 WindowView 管理
- 提供一致的加载状态处理
- 统一的活动状态管理

### 2. **灵活的渲染策略**
- 支持多种资源类型的条件渲染
- 可扩展的组件选择机制
- 自定义加载组件支持

### 3. **高效的多窗口支持**
- 虚拟化窗口管理（只渲染活动窗口）
- 窗口状态独立管理
- 快速窗口切换

## 八、关键代码流程

### 初始化流程
```typescript
// 1. Workspace 创建窗口
const resource = new Resource(resourceData, resourceType, workspace);
const window = new EditorWindow(resource, workspace, config);

// 2. 窗口添加到 windows 数组
this.windows = [...this.windows, window];

// 3. Workbench 渲染 WindowView
windows.map(window => <WindowView window={window} active={isActive} />)

// 4. WindowView 条件渲染
if (!window.initReady) return <Loading />;
if (resource.type === 'webview') return <DesignerView />;
return <ResourceView />;
```

### 窗口切换流程
```typescript
// 1. 切换窗口
workspace.window = targetWindow;

// 2. 更新状态
workspace.emitChangeActiveWindow();

// 3. Workbench 重新计算 active
active={d.id === workspace.window?.id}

// 4. WindowView 更新样式
className={`workspace-engine-main ${active ? 'active' : ''}`}
```

## 九、总结

WindowView 是 Workspace 多窗口架构的**核心视图管理器**，它：

1. **统一管理**各种类型的编辑器窗口（本地编辑器、外部网页等）
2. **智能渲染**根据窗口状态和资源类型选择合适的渲染组件
3. **状态管理**处理窗口的初始化、激活、切换等状态
4. **扩展性好**支持自定义加载组件和新的资源类型

这种设计使得低代码引擎能够**灵活地集成各种编辑工具**，同时提供**一致的用户体验**和**高效的多窗口管理**能力。
