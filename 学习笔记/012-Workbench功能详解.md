# Workbench 功能详解

## 一、普通模式 Workbench 功能详解

### 1. 核心定位
**普通 Workbench** 是单一编辑器模式的布局容器，提供固定的区域划分和插件管理机制。

### 2. 主要功能列表

#### 2.1 骨架系统构建
```typescript
skeleton.buildFromConfig(config, components);
```
- **功能**：根据配置初始化骨架系统
- **作用**：
  - 注册所有插件到对应区域
  - 设置区域的显示/隐藏规则
  - 配置插件的加载顺序
  - 管理插件间的依赖关系

#### 2.2 区域管理（7个核心区域）

| 区域 | 组件 | 功能 | 具体作用 |
|------|------|------|----------|
| **TopArea** | `<TopArea />` | 顶部工具栏 | • 显示项目标题<br>• 全局操作按钮（保存、预览、发布）<br>• 用户信息和设置入口<br>• 模式切换（设计/源码/预览） |
| **LeftArea** | `<LeftArea />` | 左侧面板 | • **组件库面板**：展示可拖拽组件<br>• **大纲树**：显示页面结构<br>• **页面管理**：多页面切换<br>• **数据源管理**：API配置 |
| **LeftFloatPane** | `<LeftFloatPane />` | 浮动面板 | • 可收起/展开<br>• 临时性工具面板<br>• 上下文相关的辅助功能<br>• 减少主界面占用空间 |
| **LeftFixedPane** | `<LeftFixedPane />` | 固定面板 | • 始终可见的快捷工具<br>• 常用功能入口<br>• 导航快捷方式<br>• 状态指示器 |
| **Toolbar** | `<Toolbar />` | 工具栏 | • **撤销/重做**操作<br>• **画布缩放**控制<br>• **对齐工具**<br>• **设备切换**（PC/移动端） |
| **MainArea** | `<MainArea />` | 主编辑区 | • **DesignerPlugin 渲染位置**<br>• 画布和模拟器<br>• 拖拽交互处理<br>• 组件选中和编辑 |
| **BottomArea** | `<BottomArea />` | 底部面板 | • **控制台输出**<br>• **错误日志**<br>• **调试信息**<br>• **构建输出** |
| **RightArea** | `<RightArea />` | 右侧面板 | • **属性设置面板**<br>• **样式编辑器**<br>• **事件绑定**<br>• **高级配置** |

#### 2.3 上下文提供
```tsx
<SkeletonContext.Provider value={skeleton}>
```
- **功能**：通过 React Context 向下传递 skeleton 实例
- **作用**：
  - 让所有子组件访问骨架系统
  - 统一的插件注册和管理
  - 跨组件通信机制
  - 状态共享

#### 2.4 提示系统
```tsx
<TipContainer />
```
- **功能**：全局提示容器
- **作用**：
  - 操作成功/失败提示
  - 引导提示
  - 错误信息展示
  - 帮助信息弹出

### 3. 插件系统集成

普通 Workbench 通过 Skeleton 管理插件：

```typescript
// 插件注册示例
skeleton.add({
    area: 'mainArea',        // 目标区域
    name: 'designer',        // 插件名称
    type: 'Widget',          // 插件类型
    content: DesignerPlugin, // 插件内容
    props: {},              // 插件属性
});
```

### 4. 数据流

```
engine.init()
    ↓
plugins.init()  // 普通模式插件初始化
    ↓
Workbench 渲染
    ↓
skeleton.buildFromConfig()  // 构建骨架
    ↓
各区域组件渲染
    ↓
插件内容填充
```

---

## 二、工作空间模式 WorkSpaceWorkbench 功能详解

### 1. 核心定位
**WorkSpaceWorkbench** 是多窗口管理模式的高级布局容器，支持同时打开多个编辑器实例。

### 2. 主要功能列表

#### 2.1 工作空间管理
```typescript
workspace: Workspace
```
- **功能**：管理整个工作空间
- **作用**：
  - 多窗口生命周期管理
  - 资源统一调度
  - 全局状态维护
  - 跨窗口通信协调

#### 2.2 主题系统
```typescript
engineConfig.onGot('theme', (theme) => {
    this.setState({ theme });
});
```
- **功能**：动态主题切换
- **作用**：
  - 支持多主题（暗黑/明亮）
  - 实时主题切换
  - 自定义主题扩展
  - 主题持久化存储

#### 2.3 空工作区处理
```typescript
workspaceEmptyComponent: any
```
- **功能**：无窗口时的显示组件
- **作用**：
  - 欢迎页面展示
  - 快速开始引导
  - 最近项目列表
  - 模板选择界面

#### 2.4 核心窗口管理

##### 多窗口渲染机制
```tsx
workspace.windows.map(d => (
    <WindowView
        active={d.id === workspace.window?.id}
        window={d}
        key={d.id}
    />
))
```

| 功能 | 作用 | 实现细节 |
|------|------|----------|
| **窗口数组管理** | 维护所有打开的窗口 | `workspace.windows[]` 数组存储 |
| **激活状态控制** | 标识当前编辑窗口 | `active` 属性控制显示/隐藏 |
| **窗口切换** | 多窗口间快速切换 | SubTopArea 显示标签页 |
| **独立上下文** | 每个窗口独立状态 | 各自的 document、project 实例 |

#### 2.5 特殊区域功能

| 区域 | 特殊功能 | 与普通模式的区别 |
|------|----------|-----------------|
| **SubTopArea** | 窗口标签管理 | 普通模式无此区域 |
| **WindowView区域** | 动态窗口容器 | 替代固定的 MainArea |
| **无 RightArea** | 属性面板内置 | 每个窗口独立管理属性面板 |

### 3. 窗口类型支持

#### 3.1 Editor 类型窗口
```typescript
resourceType: 'editor'
```
- 标准低代码编辑器
- 完整的设计器功能
- 独立的画布和属性面板

#### 3.2 Webview 类型窗口
```typescript
resourceType: 'webview'
```
- 嵌入外部网页
- 第三方工具集成
- 自定义扩展页面

### 4. 高级功能

#### 4.1 窗口生命周期
```typescript
// 创建窗口
workspace.openEditorWindow(name, title, options);

// 激活窗口
workspace.setActiveWindow(windowId);

// 关闭窗口
workspace.removeEditorWindow(name, id);

// 窗口就绪事件
workspace.onWindowReady(callback);
```

#### 4.2 资源管理
```typescript
// 每个窗口关联的资源
window.resource = {
    name: string,      // 资源名称
    type: string,      // 资源类型
    config: object,    // 资源配置
    data: any         // 资源数据
}
```

#### 4.3 插件隔离
```typescript
// 工作空间级插件
workspace.plugins.init();

// 窗口级插件
window.plugins.register();
```

### 5. 数据流对比

#### 普通模式数据流
```
engine.init()
    ↓
plugins.init()
    ↓
单一 Skeleton 实例
    ↓
固定区域渲染
```

#### 工作空间模式数据流
```
engine.init(enableWorkspaceMode: true)
    ↓
workspace.setActive(true)
    ↓
workspace.initWindow()
    ↓
workspace.plugins.init()
    ↓
多 WindowView 实例
    ↓
动态窗口管理
```

---

## 三、功能对比总结

| 功能维度 | 普通 Workbench | WorkSpaceWorkbench |
|----------|----------------|-------------------|
| **窗口管理** | ❌ 单一固定界面 | ✅ 多窗口动态管理 |
| **布局灵活性** | ❌ 固定布局 | ✅ 动态布局 |
| **资源消耗** | ✅ 低 | ⚠️ 较高 |
| **插件系统** | ✅ 简单直接 | ✅ 分层管理 |
| **主题支持** | ✅ 支持 | ✅ 增强支持 |
| **外部集成** | ❌ 不支持 | ✅ Webview 支持 |
| **适用规模** | 小型项目 | 大型/企业级项目 |
| **学习成本** | ✅ 低 | ⚠️ 较高 |
| **性能表现** | ✅ 优秀 | ⚠️ 取决于窗口数 |
| **协作能力** | ❌ 有限 | ✅ 强大 |

## 四、选择建议

### 使用普通 Workbench 的场景
1. **单页面应用开发**
2. **组件开发和测试**
3. **快速原型搭建**
4. **嵌入式编辑器**
5. **教学和演示**

### 使用 WorkSpaceWorkbench 的场景
1. **多页面应用管理**
2. **微前端架构**
3. **团队协作开发**
4. **复杂业务系统**
5. **需要集成外部工具**
6. **企业级低代码平台**

## 五、最佳实践

### 普通模式最佳实践
```typescript
// 简洁的初始化
await init(container, {
    locale: 'zh-CN',
    enableCondition: true,
    enableCanvasLock: true,
});
```

### 工作空间模式最佳实践
```typescript
// 完整的工作空间配置
await init(container, {
    enableWorkspaceMode: true,
    enableAutoOpenFirstWindow: true,
    workspaceEmptyComponent: WelcomePage,
    defaultResourceList: [
        { name: 'home', type: 'editor' },
        { name: 'components', type: 'editor' },
        { name: 'design-system', type: 'webview', url: 'https://...' }
    ]
});
```

## 六、总结

**Workbench** 和 **WorkSpaceWorkbench** 代表了低代码引擎的两种架构理念：

- **Workbench**：追求**简洁高效**，适合快速开发和单一任务
- **WorkSpaceWorkbench**：追求**功能完备**，适合复杂项目和团队协作

两者共享核心技术栈，但在用户体验、功能范围和应用场景上有明确的定位差异。选择合适的模式，可以最大化开发效率和用户体验。
