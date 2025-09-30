我来为你详细分析 **SimulatorHost 模块**的功能、关联模块和底层原理。
Ran tool
Ran tool

好的，现在我为你详细分析 **SimulatorHost 模块**的功能、关联模块和底层原理。

---

## SimulatorHost 模块全面解析

### 一、核心定位和作用

**SimulatorHost（模拟器宿主）** 是低代码引擎的 **iframe 渲染环境管理中心**，负责管理整个画布的渲染、配置和交互。它是连接编辑器和 iframe 渲染器的桥梁，控制着画布的所有核心功能。

**核心职责**：
1. **iframe 生命周期管理**：创建、挂载、销毁 iframe 环境
2. **渲染配置管理**：设备类型、语言、主题、组件库等配置
3. **资源加载协调**：组件库、环境变量、主题资源的加载
4. **交互系统管理**：拖拽、点击、悬停、右键菜单等用户交互
5. **坐标系转换**：主窗口与 iframe 之间的坐标映射
6. **滚动控制**：画布滚动、节点定位、自动滚动

---

## 架构层次

```
packages/shell/src/api/simulator-host.ts (对外 API 层)
    ↓
packages/designer/src/builtin-simulator/host.ts (核心实现层)
    ↓
packages/designer/src/builtin-simulator/renderer.tsx (渲染器层)
    ↓
iframe 环境 (独立的渲染上下文)
```

---

## 核心方法详解

### 1. **set(key, value) - 设置配置** ⭐⭐⭐

**作用**: 设置模拟器的运行时配置，动态改变画布的行为和样式。

**底层原理**:
```typescript
// packages/designer/src/builtin-simulator/host.ts: 698-703
set(key: string, value: any) {
  this._props = {
    ...this._props,  // 保持现有配置
    [key]: value,    // 更新指定配置项
  };
  // 🔄 触发 MobX 响应式更新：引用变化 → 触发计算属性重新计算 → 渲染器自动响应
}
```

**特殊处理 - 设备类型映射**:
```typescript
// packages/designer/src/builtin-simulator/host.ts: 714-724
get(key: string): any {
  if (key === 'device') {
    // 🔄 设备映射转换：支持通过 deviceMapper 对设备类型进行转换
    return (
      this.designer?.editor?.get('deviceMapper')?.transform?.(this._props.device) ||
      this._props.device
    );
  }
  return this._props[key];
}
```

**关联模块**:
- **Viewport**: 根据 device 配置调整视口尺寸
- **Renderer**: 根据配置渲染不同的设备外框
- **Document**: 读取 designMode、locale 等配置

**使用示例 1: 设置设备类型**

```typescript
import { project } from '@alilc/lowcode-engine';

// 方式1: 使用内置设备类型
project.simulatorHost.set('device', 'mobile');
// 结果: 画布变为手机尺寸（通常 375px 宽）

project.simulatorHost.set('device', 'iphonex');
// 结果: 画布变为 iPhone X 尺寸（375x812）

project.simulatorHost.set('device', 'iphone6');
// 结果: 画布变为 iPhone 6 尺寸（375x667）

project.simulatorHost.set('device', 'default');
// 结果: 画布变为桌面端尺寸（100%宽度）
```

**使用示例 2: 自定义设备样式类**

```typescript
// 方式2: 使用自定义 CSS 类
project.simulatorHost.set('deviceClassName', 'my-ipad-device');

// 在 CSS 中定义
// .my-ipad-device {
//   width: 768px;
//   height: 1024px;
//   border: 2px solid #333;
//   border-radius: 20px;
//   background: url('ipad-frame.png');
// }
```

**使用示例 3: 直接设置样式（最灵活）**

```typescript
// 方式3: 直接设置 canvas 和 viewport 的样式
project.simulatorHost.set('deviceStyle', {
  // canvas: 外框样式（设备背景图）
  canvas: {
    width: '414px',
    height: '896px',
    backgroundColor: '#000',
    backgroundImage: 'url(iphone11-frame.png)',
    backgroundSize: 'contain',
    borderRadius: '40px',
    padding: '60px 20px',
  },
  // viewport: 内框样式（实际内容区域）
  viewport: {
    width: '375px',
    height: '812px',
    backgroundColor: '#fff',
  },
});
```

**结果对比**:

| 配置方式 | 灵活性 | 适用场景 | 效果 |
|----------|--------|----------|------|
| `device: 'mobile'` | 低 | 快速切换常见设备 | 预设的移动端尺寸 |
| `deviceClassName` | 中 | 团队统一设备样式 | 通过 CSS 类自定义 |
| `deviceStyle` | 高 | 完全自定义设备外观 | 精确控制每个样式属性 |

**使用示例 4: 设置语言环境**

```typescript
// 设置画布语言为中文
project.simulatorHost.set('locale', 'zh-CN');
// 结果: iframe 内的多语言组件显示中文

// 设置画布语言为英文
project.simulatorHost.set('locale', 'en-US');
// 结果: iframe 内的多语言组件显示英文
```

**使用示例 5: 设置设计模式**

```typescript
// 设计模式：完整编辑功能
project.simulatorHost.set('designMode', 'design');
// 结果:
// - 可以拖拽组件
// - 可以选中节点
// - 拦截原生事件（如 onClick）

// 实时模式：仅预览，无编辑
project.simulatorHost.set('designMode', 'live');
// 结果:
// - 禁用拖拽功能
// - 禁用选中功能
// - 允许原生事件执行（如按钮点击）

// 预览模式：部分交互
project.simulatorHost.set('designMode', 'preview');
// 结果:
// - Meta + 点击才能选中
// - 其他时候允许原生交互
```

---

### 2. **get(key) - 获取配置**

**作用**: 获取模拟器的当前配置值。

**底层原理**: 直接从 `_props` 对象读取，设备类型会经过 deviceMapper 转换。

**使用示例**:

```typescript
// 获取当前设备类型
const device = project.simulatorHost.get('device');
console.log(device); // => 'mobile'

// 获取当前语言
const locale = project.simulatorHost.get('locale');
console.log(locale); // => 'zh-CN'

// 获取设计模式
const designMode = project.simulatorHost.get('designMode');
console.log(designMode); // => 'design'

// 获取自定义配置
const customConfig = project.simulatorHost.get('myCustomKey');
console.log(customConfig); // => 用户设置的自定义值
```

**应用场景**:
- **插件读取配置**: 插件根据当前设备类型调整行为
- **条件渲染**: 根据设计模式显示不同的工具
- **调试信息**: 输出当前模拟器状态

---

### 3. **rerender() - 重新渲染** ⭐⭐⭐

**作用**: 触发 iframe 内容的完整重新渲染，刷新组件树和画布。

**底层原理**:
```typescript
// packages/designer/src/builtin-simulator/host.ts: 903-911
rerender() {
  // 🔄 刷新设计器的组件元数据映射表
  this.designer.refreshComponentMetasMap();

  // 🎭 触发 iframe 内渲染器的重新渲染
  this.renderer?.rerender?.();
}
```

**完整流程**:
```
1. 调用 rerender()
   ↓
2. refreshComponentMetasMap()
   - 重新解析所有组件元数据
   - 更新组件映射表
   ↓
3. renderer.rerender()
   - 触发 iframe 内的 React 重新渲染
   - 重新执行 Schema → Component 转换
   ↓
4. 画布更新
   - 组件重新挂载
   - 事件重新绑定
   - 样式重新应用
```

**关联模块**:
- **Designer**: 刷新组件元数据
- **Renderer**: 执行实际的 React 渲染
- **ComponentMeta**: 重新解析组件配置

**使用示例 1: 组件库更新后刷新**

```typescript
import { material, project } from '@alilc/lowcode-engine';

// 场景：动态加载新的组件库后需要刷新画布
async function loadNewComponents() {
  // 1. 设置新的组件资产
  await material.setAssets({
    packages: [
      {
        package: 'antd',
        version: '5.0.0',
        urls: ['https://cdn.com/antd.js', 'https://cdn.com/antd.css'],
        library: 'antd',
      },
    ],
    components: [
      {
        componentName: 'AntdButton',
        title: 'Antd Button',
        npm: {
          package: 'antd',
          version: '5.0.0',
          exportName: 'Button',
        },
      },
    ],
  });

  // 2. 重新渲染画布以加载新组件
  project.simulatorHost.rerender();

  // 结果:
  // - iframe 重新加载 antd 资源
  // - 新组件可以在画布中使用
  // - 已存在的组件保持状态
}
```

**使用示例 2: 主题切换后刷新**

```typescript
import { project } from '@alilc/lowcode-engine';

// 场景：用户切换主题后需要刷新画布
function switchTheme(themeName: string) {
  // 1. 设置新的主题资源
  project.simulatorHost.set('theme', {
    type: 'CSSUrl',
    content: `https://cdn.com/themes/${themeName}.css`,
  });

  // 2. 重新渲染以应用新主题
  project.simulatorHost.rerender();

  // 结果:
  // - 旧主题 CSS 被新主题 CSS 替换
  // - 所有组件重新渲染以应用新样式
  // - 画布背景色、字体等全局样式更新
}
```

**使用示例 3: 强制刷新解决渲染问题**

```typescript
import { project } from '@alilc/lowcode-engine';

// 场景：遇到渲染异常时强制刷新
function fixRenderingIssue() {
  console.warn('检测到渲染异常，尝试重新渲染...');

  // 强制重新渲染
  project.simulatorHost.rerender();

  // 结果:
  // - 清除渲染缓存
  // - 重新挂载所有组件
  // - 恢复正常渲染状态
}
```

**⚠️ 注意事项**:
- `rerender()` 会导致 iframe 内所有组件重新挂载
- 组件的 state 会丢失（除非使用持久化状态）
- 频繁调用会影响性能，应避免在循环中使用

---

### 4. **scrollToNode(node) - 滚动到节点** ⭐⭐

**作用**: 将画布滚动到指定节点的可视区域，确保节点在视口中可见。

**底层原理**:
```typescript
// packages/designer/src/builtin-simulator/host.ts: 1920-1945
scrollToNode(node: Node, detail?: any) {
  // 🚫 防止重复滚动
  this.tryScrollAgain = null;

  // 🎯 获取组件实例
  const componentInstance = this.getComponentInstances(detail?.near?.node || node)?.[0];
  if (!componentInstance) return;

  // 🔍 查找DOM节点
  const domNode = this.findDOMNodes(componentInstance)?.[0] as Element;
  if (!domNode) return;

  // 📏 检查节点是否在视口内
  if (isElementNode(domNode) && !isDOMNodeVisible(domNode, this.viewport)) {
    // 📐 计算滚动目标位置
    const { left, top } = domNode.getBoundingClientRect();
    const { scrollTop = 0, scrollLeft = 0 } = this.contentDocument?.documentElement || {};

    // 🎯 执行滚动
    this.scroller.scrollTo({
      left: left + scrollLeft,
      top: top + scrollTop,
    });
  }
}
```

**完整流程**:
```
1. 调用 scrollToNode(node)
   ↓
2. 获取节点的组件实例
   - 从 instancesMap 查找
   ↓
3. 查找对应的 DOM 元素
   - 通过 renderer.findDOMNodes
   ↓
4. 检查是否在视口内
   - 计算元素边界与视口的关系
   ↓
5. 计算滚动位置
   - 考虑当前滚动偏移
   ↓
6. 执行平滑滚动
   - 使用 scroller.scrollTo
```

**关联模块**:
- **Scroller**: 执行平滑滚动动画
- **Viewport**: 提供视口尺寸和位置信息
- **ComponentInstance**: 获取组件的 React 实例

**使用示例 1: 选中节点后自动滚动**

```typescript
import { project } from '@alilc/lowcode-engine';

// 场景：在大纲树中选中节点后，自动滚动画布到该节点
function onOutlineTreeNodeSelect(nodeId: string) {
  const doc = project.currentDocument;
  const node = doc.getNodeById(nodeId);

  if (node) {
    // 1. 选中节点
    doc.selection.select(nodeId);

    // 2. 滚动到节点
    project.simulatorHost.scrollToNode(node);

    // 结果:
    // - 节点被选中（显示选中边框）
    // - 画布平滑滚动，确保节点在可视区域
    // - 滚动速度约 300ms，流畅自然
  }
}
```

**使用示例 2: 拖拽插入后自动聚焦**

```typescript
import { project, event } from '@alilc/lowcode-engine';

// 场景：从组件库拖拽组件到画布后，自动滚动到新插入的组件
event.on('node.add', (detail) => {
  const { node } = detail;

  // 延迟滚动，等待组件渲染完成
  setTimeout(() => {
    project.simulatorHost.scrollToNode(node);

    // 结果:
    // - 组件插入后立即可见
    // - 用户无需手动滚动查找新组件
    // - 提升编辑体验
  }, 100);
});
```

**使用示例 3: 表单验证错误定位**

```typescript
import { project } from '@alilc/lowcode-engine';

// 场景：表单验证失败后，定位到第一个错误字段
function validateForm(formNode) {
  const errors = [];

  // 遍历表单字段验证
  formNode.children.forEach((field) => {
    if (!validateField(field)) {
      errors.push(field);
    }
  });

  if (errors.length > 0) {
    // 滚动到第一个错误字段
    project.simulatorHost.scrollToNode(errors[0]);

    // 高亮错误字段
    project.currentDocument.selection.select(errors[0].id);

    // 结果:
    // - 画布滚动到错误位置
    // - 用户立即看到需要修复的字段
    // - 减少查找时间
  }
}
```

**使用示例 4: 深层节点定位**

```typescript
import { project } from '@alilc/lowcode-engine';

// 场景：在深层嵌套结构中快速定位节点
function findAndScrollToNode(nodeId: string) {
  const doc = project.currentDocument;
  const node = doc.getNodeById(nodeId);

  if (node) {
    // 展开所有父节点（如果使用了折叠功能）
    let parent = node.parent;
    while (parent) {
      parent.setExpanded?.(true);
      parent = parent.parent;
    }

    // 滚动到目标节点
    project.simulatorHost.scrollToNode(node);

    // 结果:
    // - 所有父级容器展开
    // - 画布滚动到目标节点
    // - 即使节点在很深的层级也能快速定位
  }
}
```

**⚠️ 注意事项**:
- 节点必须已经渲染，否则无法滚动
- 滚动是异步的，可能需要等待动画完成
- 如果节点在视口内，不会触发滚动

---

## 二、核心配置项详解

### 1. **device - 设备类型** ⭐⭐⭐

**底层实现**:
```typescript
// packages/designer/src/builtin-simulator/host.ts: 323-325
@computed get device(): string {
  return this.get('device') || 'default';
}
```

**内置设备类型**:

| 设备类型 | 尺寸 | 适用场景 |
|----------|------|----------|
| `default` | 100% | 桌面端（PC、Web应用） |
| `mobile` | 375px | 通用移动端 |
| `iphonex` | 375x812 | iPhone X/11/12 |
| `iphone6` | 375x667 | iPhone 6/7/8 |

**完整示例**:
```typescript
// 创建设备切换器
const DeviceSwitcher = () => {
  const devices = [
    { label: '桌面端', value: 'default', icon: '🖥️' },
    { label: '移动端', value: 'mobile', icon: '📱' },
    { label: 'iPhone X', value: 'iphonex', icon: '📱' },
    { label: 'iPhone 6', value: 'iphone6', icon: '📱' },
  ];

  return (
    <div className="device-switcher">
      {devices.map(device => (
        <button
          key={device.value}
          onClick={() => {
            project.simulatorHost.set('device', device.value);
          }}
        >
          {device.icon} {device.label}
        </button>
      ))}
    </div>
  );
};
```

---

### 2. **designMode - 设计模式** ⭐⭐⭐

**底层实现**:
```typescript
// packages/designer/src/builtin-simulator/host.ts: 355-359
@computed get designMode(): 'live' | 'design' | 'preview' {
  return this.get('designMode') || 'design';
}
```

**模式对比**:

| 模式 | 拖拽 | 选中 | 原生事件 | 适用场景 |
|------|------|------|----------|----------|
| `design` | ✅ | ✅ | ❌ | 正常编辑 |
| `live` | ❌ | ❌ | ✅ | 实时预览 |
| `preview` | ❌ | Meta+点击 | ✅ | 调试模式 |

**完整示例**:
```typescript
// 创建模式切换器
const ModeSwitcher = () => {
  const modes = [
    {
      label: '编辑模式',
      value: 'design',
      description: '完整编辑功能，拦截所有原生事件'
    },
    {
      label: '预览模式',
      value: 'live',
      description: '纯预览，允许原生交互'
    },
    {
      label: '调试模式',
      value: 'preview',
      description: 'Meta+点击选中，其他时候正常交互'
    },
  ];

  const [currentMode, setCurrentMode] = useState('design');

  return (
    <div className="mode-switcher">
      {modes.map(mode => (
        <div
          key={mode.value}
          className={currentMode === mode.value ? 'active' : ''}
          onClick={() => {
            project.simulatorHost.set('designMode', mode.value);
            setCurrentMode(mode.value);
          }}
        >
          <h4>{mode.label}</h4>
          <p>{mode.description}</p>
        </div>
      ))}
    </div>
  );
};
```

---

## 三、底层核心系统

### 1. **iframe 环境管理系统**

**挂载流程**:
```typescript
// packages/designer/src/builtin-simulator/host.ts: 929-1063
async mountContentFrame(iframe: HTMLIFrameElement | null): Promise<void> {
  // 1. 建立iframe引用
  this._iframe = iframe;
  this._contentWindow = iframe.contentWindow!;
  this._contentDocument = this._contentWindow.document;

  // 2. 构建组件库资源包
  const libraryAsset: AssetList = this.buildLibrary();

  // 3. 组装资源包（环境+库+主题+渲染器）
  const vendors = [
    assetBundle(this.get('environment') || defaultEnvironment, AssetLevel.Environment),
    assetBundle(this.get('extraEnvironment'), AssetLevel.Environment),
    assetBundle(libraryAsset, AssetLevel.Library),
    assetBundle(this.theme, AssetLevel.Theme),
    assetBundle(this.get('simulatorUrl') || defaultSimulatorUrl, AssetLevel.Runtime),
  ];

  // 4. 创建模拟器渲染器
  const renderer = await createSimulator(this, iframe, vendors);

  // 5. 等待资源加载
  await this.componentsConsumer.waitFirstConsume();
  await this.injectionConsumer.waitFirstConsume();

  // 6. 启动渲染
  renderer.run();

  // 7. 初始化交互系统
  this.setupEvents();

  // 8. 绑定快捷键和剪贴板
  const hotkey = this.designer.editor.get('innerHotkey');
  hotkey.mount(this._contentWindow);
  clipboard.injectCopyPaster(this._contentDocument);
}
```

---

### 2. **资源加载系统**

**组件库构建**:
```typescript
// packages/designer/src/builtin-simulator/host.ts: 842-895
buildLibrary(library?: LibraryItem[]) {
  const _library = library || (this.get('library') as LibraryItem[]);
  const libraryAsset: AssetList = [];
  const libraryExportList: string[] = [];

  if (_library && _library.length) {
    _library.forEach((item) => {
      // 建立包名到库名的映射
      this.libraryMap[item.package] = item.library;

      // 异步库单独管理
      if (item.async) {
        this.asyncLibraryMap[item.package] = item;
      }

      // 导出别名处理
      if (item.exportName && item.library) {
        libraryExportList.push(
          `Object.defineProperty(window,'${item.exportName}',{get:()=>window.${item.library}});`
        );
      }

      // 资源URL收集
      if (item.editUrls) {
        libraryAsset.push(item.editUrls);
      } else if (item.urls) {
        libraryAsset.push(item.urls);
      }
    });
  }

  libraryAsset.unshift(assetItem(AssetType.JSText, libraryExportList.join('')));
  return libraryAsset;
}
```

---

## 四、总结

### SimulatorHost 的核心价值

| 功能 | 作用 | 使用场景 |
|------|------|----------|
| `set(key, value)` | 动态配置画布 | 设备切换、主题切换、模式切换 |
| `get(key)` | 获取配置 | 插件读取、条件渲染、调试 |
| `rerender()` | 强制刷新 | 组件库更新、主题切换、错误恢复 |
| `scrollToNode()` | 节点定位 | 选中后聚焦、错误定位、深层查找 |

### 关键设计理念

1. **响应式配置**: 通过 MobX 实现配置变化自动触发渲染更新
2. **iframe 隔离**: 编辑器和画布完全隔离，避免样式和脚本冲突
3. **资源管理**: 统一管理组件库、主题、环境变量的加载
4. **坐标转换**: 自动处理主窗口和 iframe 之间的坐标映射
5. **交互拦截**: 在设计态拦截原生事件，转换为设计器操作

SimulatorHost 是低代码引擎的"画布控制器"，它让整个 iframe 渲染环境变得可控、可配置、可交互！