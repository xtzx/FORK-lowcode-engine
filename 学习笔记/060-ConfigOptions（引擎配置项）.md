我来为你详细分析 **ConfigOptions（引擎配置项）** 的功能、关联模块和底层原理。
Ran tool

Ran tool

Ran tool

好的，现在我为你详细分析 **ConfigOptions（引擎配置项）** 的功能、关联模块和底层原理。

---

## ConfigOptions 模块全面解析

### 一、配置系统架构

**配置层级**:
```
用户传入配置（init 或 config.set）
    ↓
packages/editor-core/src/config.ts (EngineConfig)
    ↓
严格模式校验（VALID_ENGINE_OPTIONS）
    ↓
存储到 config 对象
    ↓
各模块通过 engineConfig.get() 读取
```

**底层原理**:
```typescript
// packages/editor-core/src/config.ts: 201-287

export class EngineConfig implements IEngineConfig {
  private config: { [key: string]: any } = {};

  // 设置引擎配置（支持严格模式）
  setEngineOptions(engineOptions: IPublicTypeEngineOptions) {
    const strictMode = getStrictModeValue(engineOptions, STRICT_PLUGIN_MODE_DEFAULT);

    if (strictMode) {
      // 严格模式：只允许预定义的配置项
      Object.keys(engineOptions).forEach((key) => {
        if (VALID_ENGINE_OPTIONS[key]) {
          this.set(key, engineOptions[key]);
        } else {
          logger.warn(`${key} is not a valid option`);
        }
      });
    } else {
      // 宽松模式：允许任意配置项
      this.setConfig(engineOptions);
    }
  }

  // 获取配置值
  get(key: string, defaultValue?: any) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  // 设置配置值
  set(key: string, value: any) {
    this.config[key] = value;
    // 触发监听器
    this.emitChange(key, value);
  }
}
```

---

## 核心配置项详解

### 一、画布配置

### 1. **locale - 语言** ⭐

**作用**: 设置引擎的界面语言。

**默认值**: `'zh-CN'`

**底层原理**:
```typescript
// 配置会影响所有国际化文本的显示
engineConfig.set('locale', 'en-US');

// 在组件中使用
const locale = engineConfig.get('locale', 'zh-CN');
const i18nText = translations[locale]['button.save'];
```

**使用示例**:
```javascript
import { init } from '@alilc/lowcode-engine';

// 场景1：设置英文界面
init(container, {
  locale: 'en-US'
});

// 场景2：动态切换语言
import { config } from '@alilc/lowcode-engine';
config.set('locale', 'zh-CN');  // 切换为中文

// 结果：
// - 所有 UI 文本变为中文
// - 组件面板、属性面板等都显示中文
```

---

### 2. **device - 设备类型** ⭐⭐

**作用**: 设置画布的设备类型（PC、手机、平板等）。

**支持的设备类型**:
- `default`: 默认（全宽）
- `mobile`: 移动端通用
- `iphonex`: iPhone X
- `iphone6`: iPhone 6
- `phone`: 手机
- `tablet`: 平板
- `desktop`: 桌面

**底层原理**:
```typescript
// packages/designer/src/builtin-simulator/host-view.tsx: 92-123

render() {
  const sim = this.props.host;
  let className = 'lc-simulator-canvas';

  // 根据 device 添加类名
  if (sim.device) {
    className += ` lc-simulator-device-${sim.device}`;
  }

  // 设备样式
  const { canvas = {}, viewport = {} } = sim.deviceStyle || {};

  return (
    <div className={className} style={canvas}>
      <div className="lc-simulator-canvas-viewport" style={viewport}>
        {/* 画布内容 */}
      </div>
    </div>
  );
}
```

**CSS 样式定义**:
```css
/* 手机设备样式 */
.lc-simulator-device-phone {
  top: 16px;
  bottom: 16px;
  left: 50%;
  width: 375px;  /* iPhone 宽度 */
  transform: translateX(-50%);
  margin: auto;
}

/* 平板设备样式 */
.lc-simulator-device-tablet {
  width: 768px;
  transform: translateX(-50%);
}
```

**使用示例**:
```javascript
// 场景1：设置为手机模式
init(container, {
  device: 'phone'
});

// 结果：
// - 画布宽度变为 375px（模拟 iPhone）
// - 画布居中显示
// - 可以预览移动端效果

// 场景2：动态切换设备
import { config } from '@alilc/lowcode-engine';

// 切换到平板
config.set('device', 'tablet');

// 切换到桌面
config.set('device', 'desktop');

// 场景3：自定义设备类型
config.set('device', 'custom-device');

// 需要添加自定义样式
// .lc-simulator-device-custom-device {
//   width: 1024px;
//   height: 600px;
// }
```

---

### 3. **deviceClassName - 自定义设备类名**

**作用**: 为画布添加自定义类名，用于完全自定义设备样式。

**使用示例**:
```javascript
init(container, {
  deviceClassName: 'my-custom-device',
});

// 添加自定义样式
/*
.my-custom-device {
  background: url('device-frame.png') no-repeat center;
  background-size: contain;
  width: 400px;
  height: 800px;
}
*/
```

---

### 4. **appHelper - 应用辅助对象** ⭐⭐

**作用**: 注入全局的工具函数和常量到渲染器，可在 JSExpression 中使用。

**底层原理**:
```typescript
// appHelper 会被注入到 iframe 的全局上下文
const appHelper = {
  utils: {
    formatDate: (date) => {...},
    request: (url) => {...}
  },
  constants: {
    API_BASE: 'https://api.example.com',
    MAX_COUNT: 100
  }
};

// 在 iframe 中可以访问
window.appHelper = appHelper;
```

**使用示例**:
```javascript
// 场景1：注入工具函数
init(container, {
  appHelper: {
    utils: {
      // 格式化日期
      formatDate: (date) => {
        return new Date(date).toLocaleDateString();
      },

      // 发送请求
      request: async (url) => {
        const res = await fetch(url);
        return res.json();
      },

      // 生成唯一ID
      uuid: () => {
        return Math.random().toString(36).substr(2, 9);
      }
    },
    constants: {
      API_BASE: 'https://api.example.com',
      PAGE_SIZE: 20
    }
  }
});

// 场景2：在组件中使用
{
  componentName: 'Text',
  props: {
    // 使用工具函数
    content: {
      type: 'JSExpression',
      value: 'this.utils.formatDate(this.state.date)'
    }
  }
}

// 场景3：在数据源中使用
{
  componentName: 'Table',
  props: {
    dataSource: {
      type: 'JSExpression',
      value: 'this.utils.request(this.constants.API_BASE + "/users")'
    }
  }
}
```

---

### 5. **enableCondition - 启用条件渲染** ⭐⭐

**作用**: 控制组件的 `condition` 属性是否生效。

**默认值**: `false`（设计器中所有组件都显示）

**底层原理**:
```typescript
// packages/designer/src/document/node/props/prop.ts: 277-286

export(stage) {
  if (stage === IPublicEnumTransformStage.Render && this.key === '___condition___') {
    // 在渲染时检查 enableCondition 配置
    if (engineConfig?.get('enableCondition') !== true) {
      return true;  // 强制返回 true，显示所有组件
    }
    return this._value;  // 返回实际的 condition 值
  }
  // ...
}
```

**使用示例**:
```javascript
// 场景1：关闭条件渲染（默认）
init(container, {
  enableCondition: false
});

// 组件配置
{
  componentName: 'Button',
  props: {
    ___condition___: false  // 实际应该隐藏
  }
}

// 结果：Button 在设计器中仍然显示（方便编辑）

// 场景2：开启条件渲染
config.set('enableCondition', true);

// 结果：Button 在设计器中隐藏（真实预览效果）

// 场景3：使用 JSExpression 控制显示
{
  componentName: 'Button',
  props: {
    ___condition___: {
      type: 'JSExpression',
      value: 'this.state.isAdmin'  // 只有管理员可见
    }
  }
}

// enableCondition = false: 按钮始终显示
// enableCondition = true: 按钮根据 state.isAdmin 显示/隐藏
```

---

### 6. **disableAutoRender - 禁用自动渲染**

**作用**: 关闭画布自动渲染，适用于资产包异步加载场景。

**使用场景**: 当你需要加载多个资产包时，避免每次加载都重新渲染。

**使用示例**:
```javascript
// 场景：加载多个组件库
init(container, {
  disableAutoRender: true  // 禁用自动渲染
});

// 加载基础组件库
await material.setAssets(baseAssets);

// 加载业务组件库
await material.loadIncrementalAssets(bizAssets);

// 加载自定义组件库
await material.loadIncrementalAssets(customAssets);

// 手动触发渲染
project.simulatorHost.rerender();

// 结果：
// - 加载过程中画布不会多次刷新
// - 所有资产包加载完成后统一渲染
// - 性能更好，避免闪烁
```

---

### 7. **simulatorUrl - 自定义模拟器** ⭐⭐

**作用**: 指定自定义的模拟器渲染器 URL。

**底层原理**:
```typescript
// packages/designer/src/builtin-simulator/host.ts

const vendors = [
  assetBundle(
    this.get('simulatorUrl') || defaultSimulatorUrl,
    AssetLevel.Runtime
  ),
];

// 创建 iframe 并注入 simulatorUrl 的资源
const renderer = await createSimulator(this, iframe, vendors);
```

**使用示例**:
```javascript
// 场景1：使用自定义渲染器
init(container, {
  simulatorUrl: [
    'https://cdn.example.com/custom-renderer.js',
    'https://cdn.example.com/custom-renderer.css'
  ]
});

// 场景2：使用本地渲染器（开发调试）
init(container, {
  simulatorUrl: [
    'http://localhost:5555/js/simulator-renderer.js'
  ]
});

// 场景3：Vue 渲染器
init(container, {
  simulatorUrl: [
    'https://cdn.example.com/vue-renderer.js'
  ],
  renderEnv: 'vue'
});
```

---

### 8. **enableStrictNotFoundMode - 严格未找到模式**

**作用**: 当组件未找到时，是否使用默认容器组件。

**使用示例**:
```javascript
// 场景1：宽松模式（默认）
init(container, {
  enableStrictNotFoundMode: false
});

// Schema 中使用了未注册的组件
{
  componentName: 'UnknownComponent',
  children: [...]
}

// 结果：引擎会用 Div 容器替代 UnknownComponent，children 正常渲染

// 场景2：严格模式
init(container, {
  enableStrictNotFoundMode: true
});

// 结果：UnknownComponent 不渲染，显示错误占位符
```

---

### 二、编排配置

### 9. **focusNodeSelector - 指定根组件** ⭐

**作用**: 自定义根组件的选择逻辑（用于特殊布局场景）。

**使用示例**:
```javascript
// 场景：应用有一个固定的外壳，编辑区域是内部的某个节点
init(container, {
  focusNodeSelector: (rootNode) => {
    // 找到真正的编辑区域
    const contentArea = rootNode.children.find(
      child => child.componentName === 'ContentArea'
    );
    return contentArea || rootNode;
  }
});

// Schema 结构
{
  componentName: 'AppShell',  // 固定外壳
  children: [
    {
      componentName: 'Header'  // 固定头部
    },
    {
      componentName: 'ContentArea',  // 🎯 编辑区域
      children: [
        // 用户实际编辑的内容
      ]
    },
    {
      componentName: 'Footer'  // 固定底部
    }
  ]
}

// 结果：
// - 拖拽组件只能拖入 ContentArea
// - Header 和 Footer 不可编辑
```

---

### 10. **supportVariableGlobally - 全局变量支持** ⭐

**作用**: 所有属性都支持变量配置（显示变量设置器）。

**使用示例**:
```javascript
// 场景1：默认（关闭）
init(container, {
  supportVariableGlobally: false
});

// 结果：
// - 只有明确配置了 supportVariable 的属性才显示变量设置器
// - 大多数属性只能输入固定值

// 场景2：开启全局变量
init(container, {
  supportVariableGlobally: true
});

// 结果：
// - 所有属性右侧都有"🔗"图标
// - 点击可以绑定变量或表达式

// 使用效果
{
  componentName: 'Button',
  props: {
    type: {
      type: 'JSExpression',
      value: 'this.state.buttonType'  // 绑定变量
    },
    children: {
      type: 'JSExpression',
      value: 'this.state.isLoading ? "加载中..." : "确定"'
    }
  }
}
```

---

### 11. **customizeIgnoreSelectors - 自定义点击忽略** ⭐

**作用**: 配置画布中哪些元素的点击事件被忽略（不选中组件）。

**默认忽略的元素**:
- `.next-input` (输入框)
- `.next-select` (下拉选择)
- `.next-date-picker` (日期选择器)
- 等等...

**使用示例**:
```javascript
init(container, {
  customizeIgnoreSelectors: (defaultSelectors, e) => {
    return [
      ...defaultSelectors,
      '.custom-editor',      // 忽略自定义编辑器
      '.rich-text-editor',   // 忽略富文本编辑器
      '.code-mirror'         // 忽略代码编辑器
    ];
  }
});

// 结果：
// - 点击输入框时，不会选中组件，可以正常输入
// - 点击自定义编辑器时，不会选中组件，可以正常编辑
// - 点击其他区域时，会选中组件
```

---

### 12. **enableCanvasLock - 启用画布锁定** ⭐

**作用**: 启用组件的锁定功能。

**使用示例**:
```javascript
init(container, {
  enableCanvasLock: true  // 启用锁定功能
});

// 组件会显示"锁定"按钮
// 锁定后的效果：
// - 组件不可拖拽
// - 组件不可删除
// - 组件不可编辑（取决于 enableLockedNodeSetting）

// 使用 API 锁定组件
const node = project.currentDocument.getNodeById('node_abc');
node.lock();  // 锁定
node.unlock();  // 解锁
```

---

### 13. **enableLockedNodeSetting - 锁定节点可设置**

**作用**: 锁定的容器是否可以设置属性。

**使用示例**:
```javascript
init(container, {
  enableCanvasLock: true,          // 启用锁定
  enableLockedNodeSetting: true    // 锁定后仍可设置属性
});

// 结果：
// - 容器锁定后不可拖拽、删除
// - 但可以在属性面板修改属性
// - 适用于：固定布局但需要调整样式的场景
```

---

### 14. **enableMouseEventPropagationInCanvas - 鼠标事件冒泡**

**作用**: 控制鼠标事件是否在画布中冒泡。

**默认值**: `false`（不冒泡，性能更好）

**使用示例**:
```javascript
init(container, {
  enableMouseEventPropagationInCanvas: true
});

// 开启后：
// - mouseover 事件会冒泡
// - mouseleave 事件会冒泡
// - mousemove 事件会冒泡

// 适用场景：
// - 需要监听嵌套组件的鼠标事件
// - 自定义的交互提示
```

---

### 15. **enableContextMenu - 启用右键菜单** ⭐⭐

**作用**: 启用画布的右键菜单。

**使用示例**:
```javascript
init(container, {
  enableContextMenu: true
});

// 右键菜单会显示：
// - 复制
// - 粘贴
// - 删除
// - 锁定/解锁
// - 自定义菜单项（通过 material.addContextMenuOption 添加）

// 配合自定义菜单项
import { material } from '@alilc/lowcode-engine';

material.addContextMenuOption({
  name: 'customAction',
  title: '自定义操作',
  action: (nodes) => {
    console.log('选中的节点:', nodes);
  }
});
```

---

### 16. **disableDetecting - 禁用拖拽检测**

**作用**: 禁用拖拽时的虚线响应（性能优化）。

**使用示例**:
```javascript
// 场景：组件数量非常多，拖拽时卡顿
init(container, {
  disableDetecting: true  // 禁用检测虚线
});

// 结果：
// - 拖拽时不显示插入位置的虚线
// - 性能提升明显
// - 但用户体验稍差（看不到插入位置）
```

---

### 17. **disableDefaultSettingPanel - 禁用默认设置面板**

**作用**: 禁用内置的属性设置面板。

**使用示例**:
```javascript
init(container, {
  disableDefaultSettingPanel: true  // 禁用默认面板
});

// 适用场景：
// - 使用自定义的属性面板
// - 属性配置通过其他方式提供

// 自定义属性面板
skeleton.add({
  area: 'rightArea',
  type: 'Panel',
  name: 'customSettingPanel',
  content: CustomSettingPanel
});
```

---

### 18. **disableDefaultSetters - 禁用默认设置器**

**作用**: 禁用内置的属性设置器。

**使用示例**:
```javascript
init(container, {
  disableDefaultSetters: true
});

// 需要手动注册所有设置器
import { setters } from '@alilc/lowcode-engine';

setters.registerSetter('StringSetter', CustomStringSetter);
setters.registerSetter('NumberSetter', CustomNumberSetter);
// ...
```

---

### 19. **stayOnTheSameSettingTab - 保持设置标签页**

**作用**: 切换节点时，保持在相同的设置标签页。

**使用示例**:
```javascript
init(container, {
  stayOnTheSameSettingTab: true
});

// 默认行为（false）：
// 1. 选中 Button，在"属性"tab
// 2. 选中 Input，切换到"属性"tab（从头开始）

// 开启后：
// 1. 选中 Button，在"样式"tab
// 2. 选中 Input，仍在"样式"tab
```

---

### 20. **hideSettingsTabsWhenOnlyOneItem - 单项隐藏标签页**

**使用示例**:
```javascript
init(container, {
  hideSettingsTabsWhenOnlyOneItem: true
});

// 组件只有"属性"一个tab
// 结果：不显示 tab 栏，直接显示内容

// 组件有"属性"和"样式"两个tab
// 结果：显示 tab 栏
```

---

### 21. **hideComponentAction - 隐藏辅助层**

**使用示例**:
```javascript
init(container, {
  hideComponentAction: true
});

// 结果：
// - 选中组件时不显示操作按钮（删除、复制等）
// - 适用于：只预览不编辑的场景
```

---

### 22. **thisRequiredInJSE - JSExpression 需要 this**

**作用**: 控制 JSExpression 中访问上下文变量的方式。

**默认值**: `true`（必须使用 `this.`）

**使用示例**:
```javascript
// 场景1：默认（需要 this）
init(container, {
  thisRequiredInJSE: true
});

{
  type: 'JSExpression',
  value: 'this.state.count'  // ✅ 正确
}

{
  type: 'JSExpression',
  value: 'state.count'  // ❌ 错误
}

// 场景2：兼容旧版本（不需要 this）
init(container, {
  thisRequiredInJSE: false
});

{
  type: 'JSExpression',
  value: 'state.count'  // ✅ 正确（兼容模式）
}

{
  type: 'JSExpression',
  value: 'this.state.count'  // ✅ 也正确
}
```

---

### 三、应用级设计器配置

### 23. **enableWorkspaceMode - 应用级设计模式** ⭐⭐⭐

**作用**: 启用多窗口/多页面的应用级设计模式。

**底层原理**:
```typescript
// packages/engine/src/engine-core.ts: 312-336

if (options && options.enableWorkspaceMode) {
  // 渲染工作空间工作台
  render(
    createElement(WorkSpaceWorkbench, {
      workspace: innerWorkspace,
      className: 'engine-main',
    }),
    engineContainer
  );

  innerWorkspace.setActive(true);
  innerWorkspace.initWindow();

  // 初始化工作空间插件
  await innerWorkspace.plugins.init(pluginPreference);
}
```

**使用示例**:
```javascript
// 场景：多页面应用编辑器
init(container, {
  enableWorkspaceMode: true,
  enableAutoOpenFirstWindow: true
});

// 创建多个窗口（页面）
import { workspace } from '@alilc/lowcode-engine';

// 窗口1：首页
const homeWindow = workspace.createWindow({
  title: '首页',
  icon: 'home',
  schema: {
    componentName: 'Page',
    fileName: 'HomePage',
    children: [...]
  }
});

// 窗口2：列表页
const listWindow = workspace.createWindow({
  title: '列表页',
  icon: 'list',
  schema: {
    componentName: 'Page',
    fileName: 'ListPage',
    children: [...]
  }
});

// 切换窗口
workspace.setActiveWindow(listWindow);

// 结果：
// - 顶部显示窗口标签页
// - 可以在不同页面间切换
// - 每个窗口有独立的 document
```

---

### 24. **enableAutoOpenFirstWindow - 自动打开首窗口**

**使用示例**:
```javascript
init(container, {
  enableWorkspaceMode: true,
  enableAutoOpenFirstWindow: true  // 默认值
});

// 结果：
// - 启动时自动打开第一个窗口
// - 不需要手动调用 workspace.openWindow()
```

---

### 25. **workspaceEmptyComponent - 空窗口占位**

**使用示例**:
```javascript
init(container, {
  enableWorkspaceMode: true,
  workspaceEmptyComponent: () => (
    <div style={{ textAlign: 'center', padding: '100px' }}>
      <h2>欢迎使用低代码编辑器</h2>
      <p>请从左侧菜单选择一个页面开始编辑</p>
    </div>
  )
});
```

---

### 四、定制组件配置

### 26. **faultComponent - 错误占位组件**

**使用示例**:
```javascript
init(container, {
  faultComponent: (props) => (
    <div style={{ border: '2px dashed red', padding: '20px' }}>
      <h3>组件渲染错误</h3>
      <p>组件: {props.componentName}</p>
      <p>错误: {props.error.message}</p>
    </div>
  )
});

// 当组件渲染出错时，显示这个占位组件
```

---

### 27. **notFoundComponent - 未找到占位组件**

**使用示例**:
```javascript
init(container, {
  notFoundComponent: (props) => (
    <div style={{ border: '2px dashed orange', padding: '20px' }}>
      <h3>组件未找到</h3>
      <p>组件名: {props.componentName}</p>
      <p>请检查组件库是否正确加载</p>
    </div>
  )
});
```

---

### 28. **loadingComponent - 加载组件** ⭐

**使用示例**:
```javascript
init(container, {
  loadingComponent: () => (
    <div style={{ textAlign: 'center', padding: '100px' }}>
      <Spin size="large" />
      <p>组件库加载中...</p>
    </div>
  )
});

// 在模拟器渲染器未就绪时显示
```

---

### 五、其他配置

### 29. **enableStrictPluginMode - 严格插件模式**

**作用**: 限制插件只能使用预定义的配置项。

**默认值**: `true`

**使用示例**:
```javascript
// 场景1：严格模式（默认）
init(container, {
  enableStrictPluginMode: true,
  customOption: 'value'  // ⚠️ 会被忽略，并打印警告
});

// 场景2：宽松模式
init(container, {
  enableStrictPluginMode: false,
  customOption: 'value'  // ✅ 允许自定义配置
});

// 插件中访问自定义配置
const MyPlugin = (ctx, options) => {
  const customValue = ctx.config.get('customOption');
  // ...
};
```

---

### 30. **requestHandlersMap - 数据源请求处理器**

**使用示例**:
```javascript
init(container, {
  requestHandlersMap: {
    fetch: async (options) => {
      const res = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: JSON.stringify(options.params)
      });
      return res.json();
    },

    axios: async (options) => {
      return axios(options);
    }
  }
});

// 在数据源中使用
{
  dataSource: {
    type: 'fetch',
    url: '/api/users',
    method: 'GET'
  }
}
```

---

### 31. **customPluginTransducer - 插件转换器**

**使用示例**:
```javascript
init(container, {
  customPluginTransducer: async (plugin, ctx, options) => {
    console.log('加载插件:', plugin.pluginName);
    console.log('插件配置:', options);

    // 可以修改插件
    return {
      ...plugin,
      async init() {
        console.log('插件初始化开始');
        await plugin.init();
        console.log('插件初始化完成');
      }
    };
  }
});

// 适用场景：
// - 插件调试
// - 插件性能监控
// - 插件权限控制
```

---

## 完整配置示例

```javascript
import { init } from '@alilc/lowcode-engine';

init(document.getElementById('engine'), {
  // 画布配置
  locale: 'zh-CN',
  device: 'default',
  enableCondition: false,
  disableAutoRender: false,
  simulatorUrl: undefined,

  // 编排配置
  supportVariableGlobally: true,
  enableCanvasLock: true,
  enableLockedNodeSetting: true,
  enableContextMenu: true,
  hideComponentAction: false,

  // 性能优化
  disableDetecting: false,
  enableMouseEventPropagationInCanvas: false,

  // 应用辅助
  appHelper: {
    utils: {
      formatDate: (date) => new Date(date).toLocaleDateString(),
      request: async (url) => {
        const res = await fetch(url);
        return res.json();
      }
    },
    constants: {
      API_BASE: 'https://api.example.com'
    }
  },

  // 自定义组件
  loadingComponent: CustomLoading,
  faultComponent: CustomError,
  notFoundComponent: CustomNotFound,

  // 应用级设计
  enableWorkspaceMode: false,

  // 其他
  enableStrictPluginMode: true,
  thisRequiredInJSE: true
});
```

---

## 总结

**ConfigOptions** 是低代码引擎的**全局配置中心**，它：

1. **控制画布行为**（设备类型、渲染模式、条件渲染等）
2. **优化性能**（禁用检测、关闭自动渲染等）
3. **定制交互**（右键菜单、锁定功能、点击忽略等）
4. **注入全局能力**（appHelper、工具函数等）
5. **支持应用级设计**（多窗口、工作空间等）

通过合理配置这些选项，可以打造符合特定业务需求的低代码编辑器。