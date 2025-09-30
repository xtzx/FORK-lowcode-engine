我来为你详细分析 **Workspace 模块**的功能、关联模块和底层原理。
Ran tool
Ran tool
Ran tool

Ran tool
Ran tool

好的，现在我为你详细分析 **Workspace 模块**的功能、关联模块和底层原理。

---

## Workspace 模块全面解析

### 一、核心定位和作用

**Workspace（工作空间）** 是低代码引擎的 **应用级管理系统**，支持多窗口、多资源、多项目的协同编辑。它是 VS Code 式的多标签编辑器架构，让低代码引擎从"单页编辑器"升级为"应用级IDE"。

**核心职责**：
1. **窗口管理（Window）**：创建、切换、关闭编辑窗口
2. **资源管理（Resource）**：管理页面、组件、数据源等资源
3. **资源类型注册（ResourceType）**：定义不同类型资源的编辑器
4. **插件系统**：应用级插件管理
5. **骨架系统**：应用级面板管理

**⚠️ 实验性功能**：文档标注为 `@experimental`，API 可能在未来版本中变化。

---

## 架构层次

```
packages/shell/src/api/workspace.ts (对外 API 层)
    ↓
packages/workspace/src/workspace.ts (核心实现层)
    ↓
├── Window (窗口管理)
├── Resource (资源管理)
├── ResourceType (资源类型)
└── BasicContext (上下文管理)
    ↓
多个 Project、Designer、Simulator 实例
```

---

## 核心变量详解

### 1. **isActive - 工作空间激活状态** ⭐⭐⭐

**作用**: 判断当前是否处于工作空间模式（多窗口模式）。

**底层实现**:
```typescript
// packages/workspace/src/workspace.ts: 182-184
setActive(value: boolean) {
  this._isActive = value;
}

// packages/shell/src/api/workspace.ts: 27-29
get isActive() {
  return this[workspaceSymbol].isActive;
}
```

**关联模块**:
- **engine-core.ts**: 通过 `enableWorkspaceMode` 配置启用
- **Plugins**: 根据 isActive 决定使用全局插件还是窗口级插件

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 检查是否为工作空间模式
if (workspace.isActive) {
  console.log('当前为应用级模式，支持多窗口编辑');
} else {
  console.log('当前为单页模式，仅支持单个项目');
}

// 根据模式调整UI
const Toolbar = () => {
  const isWorkspaceMode = workspace.isActive;

  return (
    <div className="toolbar">
      {isWorkspaceMode ? (
        // 多窗口模式：显示窗口管理按钮
        <>
          <button onClick={() => workspace.openEditorWindow(...)}>新建窗口</button>
          <button onClick={() => workspace.removeEditorWindow(...)}>关闭窗口</button>
        </>
      ) : (
        // 单页模式：只显示基础工具
        <>
          <button>保存</button>
          <button>预览</button>
        </>
      )}
    </div>
  );
};
```

---

### 2. **window - 当前激活窗口** ⭐⭐⭐

**作用**: 获取当前激活的编辑窗口实例，包含该窗口的 project、resource、editorView 等信息。

**底层实现**:
```typescript
// packages/workspace/src/workspace.ts:
@obx.ref window: IEditorWindow;

// packages/shell/src/api/workspace.ts: 31-36
get window() {
  if (!this[workspaceSymbol].window) {
    return null;
  }
  return new ShellWindow(this[workspaceSymbol].window);
}
```

**Window 的核心属性**:
- `window.id`: 窗口唯一标识
- `window.resource`: 窗口对应的资源
- `window.currentDocument`: 当前文档
- `window.project`: 窗口的项目实例

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 获取当前窗口
const currentWindow = workspace.window;

if (currentWindow) {
  console.log('窗口ID:', currentWindow.id);
  console.log('窗口标题:', currentWindow.resource.title);
  console.log('窗口类型:', currentWindow.resource.resourceType);

  // 获取当前窗口的项目
  const project = currentWindow.project;

  // 获取当前窗口的文档
  const doc = currentWindow.currentDocument;

  // 保存当前窗口的内容
  const schema = project.exportSchema();
  console.log('Schema:', schema);
}

// 监听窗口切换
workspace.onChangeActiveWindow(() => {
  const newWindow = workspace.window;
  console.log('切换到窗口:', newWindow?.id);

  // 更新UI以反映新窗口的状态
  updateToolbar(newWindow);
});
```

---

### 3. **windows - 所有窗口列表** ⭐⭐

**作用**: 获取所有打开的窗口列表，用于窗口选择器、标签栏等 UI 组件。

**底层实现**:
```typescript
// packages/workspace/src/workspace.ts:
@obx.ref windows: IEditorWindow[] = [];

// packages/shell/src/api/workspace.ts: 100-102
get windows() {
  return this[workspaceSymbol].windows.map((d) => new ShellWindow(d));
}
```

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 创建窗口标签栏组件
const WindowTabs = () => {
  const windows = workspace.windows;
  const activeWindow = workspace.window;

  return (
    <div className="window-tabs">
      {windows.map(window => (
        <div
          key={window.id}
          className={window.id === activeWindow?.id ? 'tab active' : 'tab'}
          onClick={() => workspace.openEditorWindowById(window.id)}
        >
          <span>{window.resource.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              workspace.removeEditorWindowById(window.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

// 统计窗口信息
console.log('打开的窗口数量:', workspace.windows.length);
workspace.windows.forEach((window, index) => {
  console.log(`窗口 ${index + 1}:`, {
    id: window.id,
    title: window.resource.title,
    type: window.resource.resourceType,
  });
});
```

---

### 4. **resourceList - 资源列表** ⭐⭐⭐

**作用**: 获取当前设计器的所有可编辑资源列表，如页面、组件、数据源等。

**底层实现**:
```typescript
// packages/workspace/src/workspace.ts: 195-197
getResourceList() {
  return this.resourceList;
}

// packages/shell/src/api/workspace.ts: 15-17
get resourceList() {
  return this[workspaceSymbol].getResourceList().map((d) => new ShellResource(d));
}
```

**Resource 的核心属性**:
- `id`: 资源唯一标识
- `title`: 资源标题
- `resourceName`: 资源类型名称
- `options`: 资源配置项
- `children`: 子资源（支持树形结构）

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 设置资源列表（通常在应用启动时）
workspace.setResourceList([
  {
    id: 'page1',
    title: '首页',
    resourceName: 'page',
    options: {
      // 页面配置
    },
    children: [], // 子页面
  },
  {
    id: 'page2',
    title: '用户中心',
    resourceName: 'page',
    options: {},
  },
  {
    id: 'comp1',
    title: '通用按钮',
    resourceName: 'component',
    options: {},
  },
]);

// 获取资源列表
const resources = workspace.resourceList;

// 创建资源树组件
const ResourceTree = () => {
  const resources = workspace.resourceList;

  return (
    <div className="resource-tree">
      {resources.map(resource => (
        <div
          key={resource.id}
          className="resource-item"
          onClick={() => {
            // 打开资源对应的编辑窗口
            workspace.openEditorWindow(resource);
          }}
        >
          <span>{resource.title}</span>
          <span className="type">{resource.resourceName}</span>
        </div>
      ))}
    </div>
  );
};

// 监听资源列表变化
workspace.onResourceListChange((newResourceList) => {
  console.log('资源列表已更新:', newResourceList);
  // 更新资源树UI
  refreshResourceTree();
});
```

---

### 5. **plugins - 应用级插件管理** ⭐⭐

**作用**: 获取应用级别的插件管理器，用于注册全局插件。

**底层实现**:
```typescript
// packages/shell/src/api/workspace.ts: 92-94
get plugins() {
  return new Plugins(this[workspaceSymbol].plugins, true).toProxy();
}
```

**与普通插件的区别**:

| 特性 | 应用级插件 | 窗口级插件 |
|------|-----------|----------|
| 作用域 | 整个应用 | 单个窗口 |
| 生命周期 | 应用启动-关闭 | 窗口打开-关闭 |
| 访问范围 | 所有窗口 | 当前窗口 |
| 适用场景 | 全局工具、主题 | 编辑器功能 |

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 注册应用级插件（全局生效）
const GlobalToolbarPlugin = (ctx) => {
  return {
    name: 'GlobalToolbar',
    async init() {
      // 在应用级骨架添加全局工具栏
      ctx.skeleton.add({
        area: 'topArea',
        name: 'globalToolbar',
        type: 'Widget',
        content: GlobalToolbar,
        props: {},
      });
    },
  };
};

// 在工作空间级别注册
workspace.plugins.register(GlobalToolbarPlugin);

// 结果：所有窗口共享同一个全局工具栏
```

---

### 6. **skeleton - 应用级骨架** ⭐⭐

**作用**: 获取应用级别的骨架管理器，用于管理全局面板。

**底层实现**:
```typescript
// packages/shell/src/api/workspace.ts: 96-98
get skeleton() {
  return new Skeleton(this[workspaceSymbol].skeleton, 'workspace', true);
}
```

**应用级骨架区域**:
- `topArea`: 全局顶部区域（应用菜单、用户信息等）
- `subTopArea`: 窗口标签区域（窗口切换标签）
- `leftArea`: 全局左侧区域（资源树、文件浏览器）
- `mainArea`: 窗口内容区域
- `bottomArea`: 全局底部区域（控制台、输出）

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 在应用级骨架添加资源管理面板
workspace.skeleton.add({
  area: 'leftArea',
  name: 'resourceManager',
  type: 'PanelDock',
  content: ResourceManagerPanel,
  contentProps: {},
  props: {
    icon: '📁',
    title: '资源管理',
  },
});

// 在 subTopArea 添加窗口标签
workspace.skeleton.add({
  area: 'subTopArea',
  name: 'windowTabs',
  type: 'Widget',
  content: WindowTabsComponent,
  props: {},
});

// 结果：
// - 所有窗口共享资源管理面板
// - subTopArea 显示窗口切换标签
```

---

## 核心方法详解

### 1. **registerResourceType() - 注册资源类型** ⭐⭐⭐

**作用**: 注册新的资源类型，定义该类型资源的编辑器视图和行为。

**底层原理**:
```typescript
// packages/workspace/src/workspace.ts: 186-193
async registerResourceType(resourceTypeModel: IPublicTypeResourceType): Promise<void> {
  // 创建资源类型实例
  const resourceType = new ResourceType(resourceTypeModel);

  // 存储到映射表
  this.resourceTypeMap.set(resourceTypeModel.resourceName, resourceType);

  // 如果是首个资源类型且工作空间已激活，初始化默认窗口
  if (!this.window && this.defaultResourceType && this._isActive) {
    this.initWindow();
  }
}
```

**ResourceType 配置**:
```typescript
interface IPublicTypeResourceType {
  resourceName: string;          // 资源类型名称
  resourceType: 'editor' | 'viewer'; // 编辑器或查看器
  description?: string;          // 描述
  editorViews: EditorView[];     // 编辑器视图列表
  init?: () => Promise<void>;    // 初始化函数
}

interface EditorView {
  viewName: string;              // 视图名称
  viewType?: 'editor' | 'viewer'; // 视图类型
  component: React.Component;    // 视图组件
  icon?: string;                 // 图标
  title?: string;                // 标题
}
```

**完整示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';
import { PageEditor, PagePreview } from './views';

// 注册 Page 资源类型
workspace.registerResourceType({
  resourceName: 'page',
  resourceType: 'editor',
  description: '页面编辑器',

  // 定义该类型资源的编辑器视图
  editorViews: [
    {
      viewName: 'design',
      viewType: 'editor',
      component: PageEditor,
      icon: '✏️',
      title: '设计视图',
    },
    {
      viewName: 'preview',
      viewType: 'viewer',
      component: PagePreview,
      icon: '👁️',
      title: '预览',
    },
  ],

  // 资源类型初始化
  async init() {
    console.log('Page 资源类型已注册');
  },
});

// 注册 Component 资源类型
workspace.registerResourceType({
  resourceName: 'component',
  resourceType: 'editor',
  description: '组件编辑器',
  editorViews: [
    {
      viewName: 'design',
      component: ComponentEditor,
      title: '组件编辑',
    },
  ],
});

// 现在可以打开 page 或 component 类型的资源
workspace.openEditorWindow({
  resourceName: 'page',
  title: '首页',
  id: 'page1',
  options: {},
});
```

---

### 2. **openEditorWindow() - 打开编辑窗口** ⭐⭐⭐

**作用**: 打开一个新的编辑窗口或激活已存在的窗口。

**底层原理**:
```typescript
// packages/workspace/src/workspace.ts: 280-319
async openEditorWindowByResource(resource: IResource, sleep: boolean = false): Promise<void> {
  // 🔍 检查窗口是否已存在
  const existWindow = this.windows.find(
    (win) => win.resource.id === resource.id
  );

  if (existWindow) {
    // ✅ 窗口已存在：激活该窗口
    this.window?.updateState(WINDOW_STATE.inactive); // 当前窗口失活
    this.window = existWindow;                        // 切换到目标窗口

    if (!sleep && this.window.sleep) {
      await this.window.init();                      // 唤醒睡眠窗口
    }

    this.emitChangeActiveWindow();                   // 触发窗口切换事件
    this.window.updateState(WINDOW_STATE.active);    // 目标窗口激活
    return;
  }

  // 🆕 创建新窗口
  const window = new EditorWindow(resource, this, {
    title: resource.title,
    options: resource.options,
    sleep,
  });

  // 📝 添加到窗口列表
  this.windows = [...this.windows, window];
  this.editorWindowMap.set(window.id, window);

  if (sleep) {
    // 😴 睡眠模式：仅创建不激活
    this.emitChangeWindow();
    return;
  }

  // 🎯 激活新窗口
  this.window?.updateState(WINDOW_STATE.inactive); // 旧窗口失活
  this.window = window;                            // 设置为当前窗口
  await this.window.init();                        // 初始化窗口
  this.emitChangeWindow();                         // 触发窗口变化事件
  this.emitChangeActiveWindow();                   // 触发窗口激活事件
  this.window.updateState(WINDOW_STATE.active);    // 新窗口激活
}
```

**完整使用流程**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 场景1: 从资源列表打开窗口
async function openPageEditor(resourceId: string) {
  // 从资源列表查找资源
  const resource = workspace.resourceList.find(r => r.id === resourceId);

  if (resource) {
    // 打开编辑窗口
    await workspace.openEditorWindow(resource);

    // 结果:
    // - 如果窗口已存在，直接激活
    // - 如果窗口不存在，创建新窗口
    // - 窗口初始化完成后自动激活
  }
}

// 场景2: 使用废弃的 API（兼容旧代码）
await workspace.openEditorWindow(
  'page',           // resourceName
  'page1',          // id
  { schema: {} },   // options
  'design',         // viewName
  false             // sleep
);

// 场景3: 通过 ID 打开已存在的窗口
workspace.openEditorWindowById('window-id-123');

// 场景4: 批量创建睡眠窗口（性能优化）
async function preloadWindows() {
  const resources = workspace.resourceList;

  for (const resource of resources) {
    // 创建但不激活窗口（sleep模式）
    await workspace.openEditorWindow(resource, true);
  }

  console.log('所有窗口已预加载，可快速切换');

  // 后续切换窗口时速度更快
  workspace.openEditorWindowById('page2'); // 瞬间激活
}
```

---

### 3. **removeEditorWindow() - 关闭窗口** ⭐⭐

**作用**: 关闭指定的编辑窗口，清理资源。

**底层原理**:
```typescript
// packages/workspace/src/workspace.ts:
removeEditorWindowByResource(resource: IResource): void {
  // 🔍 查找目标窗口
  const targetWindow = this.windows.find(
    (win) => win.resource.id === resource.id
  );

  if (!targetWindow) return;

  // 🗑️ 从窗口列表移除
  this.windows = this.windows.filter((win) => win !== targetWindow);
  this.editorWindowMap.delete(targetWindow.id);

  // 🎯 如果关闭的是当前窗口，切换到其他窗口
  if (this.window === targetWindow) {
    this.window = this.windows[this.windows.length - 1] || null;
    this.emitChangeActiveWindow();
  }

  // 📡 触发窗口变化事件
  this.emitChangeWindow();

  // 🧹 清理窗口资源
  targetWindow.destroy?.();
}
```

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 场景1: 关闭指定资源的窗口
const resource = workspace.resourceList[0];
workspace.removeEditorWindow(resource);

// 场景2: 通过 ID 关闭窗口
workspace.removeEditorWindowById('window-id-123');

// 场景3: 关闭所有窗口
function closeAllWindows() {
  const windows = [...workspace.windows]; // 复制数组避免修改冲突

  windows.forEach(window => {
    workspace.removeEditorWindowById(window.id);
  });

  console.log('所有窗口已关闭');
}

// 场景4: 关闭其他窗口（保留当前）
function closeOtherWindows() {
  const currentWindow = workspace.window;
  const windows = [...workspace.windows];

  windows.forEach(window => {
    if (window.id !== currentWindow?.id) {
      workspace.removeEditorWindowById(window.id);
    }
  });
}

// 场景5: 关闭前确认（防止丢失未保存内容）
async function closeWindowWithConfirm(windowId: string) {
  const window = workspace.windows.find(w => w.id === windowId);

  if (window && window.project.dirty) {
    const confirmed = await confirm('窗口有未保存的更改，确定关闭吗？');

    if (!confirmed) return;
  }

  workspace.removeEditorWindowById(windowId);
}
```

---

## 核心事件详解

### 1. **onChangeWindows() - 窗口列表变化事件** ⭐⭐

**作用**: 监听窗口的新增或删除事件。

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 监听窗口列表变化
const disposer = workspace.onChangeWindows(() => {
  console.log('窗口列表已变化');
  console.log('当前窗口数量:', workspace.windows.length);

  // 更新窗口标签栏UI
  updateWindowTabs(workspace.windows);

  // 保存窗口状态到本地存储
  saveWindowState(workspace.windows);
});

// 清理监听器
// disposer();
```

---

### 2. **onChangeActiveWindow() - 激活窗口变化事件** ⭐⭐⭐

**作用**: 监听当前激活窗口的切换事件。

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 监听窗口激活事件
workspace.onChangeActiveWindow(() => {
  const activeWindow = workspace.window;

  console.log('切换到窗口:', activeWindow?.id);

  // 更新标题栏
  document.title = `${activeWindow?.resource.title} - 低代码编辑器`;

  // 更新工具栏状态
  updateToolbarForWindow(activeWindow);

  // 加载窗口相关的插件配置
  loadWindowConfig(activeWindow);
});
```

---

### 3. **onResourceListChange() - 资源列表变化事件** ⭐⭐

**作用**: 监听资源列表数据的变更。

**使用示例**:
```typescript
import { workspace } from '@alilc/lowcode-engine';

// 监听资源列表变化
workspace.onResourceListChange((newResourceList) => {
  console.log('资源列表已更新');
  console.log('资源数量:', newResourceList.length);

  // 更新资源树UI
  refreshResourceTree(newResourceList);

  // 同步到服务器
  syncResourceListToServer(newResourceList);
});
```

---

## 完整应用示例

### 场景：构建一个多页面应用编辑器

```typescript
import { workspace, init } from '@alilc/lowcode-engine';

// 1. 初始化工作空间模式
await init(document.getElementById('app'), {
  enableWorkspaceMode: true, // 启用工作空间模式
});

// 2. 注册资源类型
workspace.registerResourceType({
  resourceName: 'page',
  resourceType: 'editor',
  description: '页面编辑器',
  editorViews: [
    {
      viewName: 'design',
      component: PageDesigner,
      title: '设计',
    },
    {
      viewName: 'code',
      component: CodeEditor,
      title: '代码',
    },
  ],
});

// 3. 设置资源列表
workspace.setResourceList([
  { id: 'home', title: '首页', resourceName: 'page', options: {} },
  { id: 'about', title: '关于我们', resourceName: 'page', options: {} },
  { id: 'contact', title: '联系我们', resourceName: 'page', options: {} },
]);

// 4. 监听事件
workspace.onChangeWindows(() => {
  console.log('窗口数量:', workspace.windows.length);
});

workspace.onChangeActiveWindow(() => {
  console.log('当前窗口:', workspace.window?.resource.title);
});

// 5. 打开窗口
const homeResource = workspace.resourceList.find(r => r.id === 'home');
await workspace.openEditorWindow(homeResource);

// 结果：
// - 创建了一个多窗口应用级编辑器
// - 支持在多个页面间快速切换
// - 每个窗口独立的 project 和 designer
// - 共享的全局插件和面板
```

---

## 总结

### Workspace 的核心价值

| 功能 | 作用 | 使用场景 |
|------|------|----------|
| `isActive` | 判断工作空间模式 | 条件渲染、模式切换 |
| `window` | 获取当前窗口 | 访问当前编辑内容 |
| `windows` | 获取所有窗口 | 窗口标签栏、窗口管理 |
| `resourceList` | 获取资源列表 | 资源树、文件浏览器 |
| `registerResourceType` | 注册资源类型 | 扩展编辑器类型 |
| `openEditorWindow` | 打开窗口 | 切换编辑内容 |
| `removeEditorWindow` | 关闭窗口 | 清理资源 |

### 关键设计理念

1. **多窗口架构**: VS Code 式的标签页管理
2. **资源抽象**: Resource → ResourceType → EditorView
3. **独立上下文**: 每个窗口有独立的 project、designer
4. **共享系统**: 应用级的 plugins、skeleton
5. **事件驱动**: 通过事件同步窗口状态

Workspace 模块让低代码引擎从单页编辑器升级为应用级 IDE，支持复杂的多窗口、多资源协同编辑场景！