/**
 * @Author liyongjie
 * @Date 2025-01-17
 */

# ReactRenderer 完整工作流程总览

## 一、架构总览

### 1.1 核心模块关系图

```
用户代码层
  ↓
<ReactRenderer schema={schema} components={components} />
  ↓
┌─────────────────────────────────────────────────────────────┐
│  @alilc/lowcode-react-renderer                               │
│  (packages/react-renderer/src/index.ts)                      │
│                                                              │
│  职责：React 适配层                                           │
│  1. 注入 React 运行时到 adapter                              │
│  2. 注册渲染器映射表                                         │
│  3. 配置 ConfigProvider                                      │
│  4. 导出 ReactRenderer 类                                    │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│  Renderer (renderer.tsx)                                     │
│                                                              │
│  职责：渲染器入口/路由分发                                    │
│  1. 验证 Schema 结构                                         │
│  2. 根据 componentName 选择渲染器                            │
│  3. 包装 AppContext.Provider                                 │
│  4. 包装 ConfigProvider                                      │
│  5. 错误边界处理                                             │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│  PageRenderer / ComponentRenderer / BlockRenderer            │
│  (page.tsx / component.tsx / block.tsx)                      │
│                                                              │
│  职责：特定类型的渲染器                                       │
│  1. 初始化 state (Page/Component 独有)                       │
│  2. 初始化 dataSource (Page/Component 独有)                  │
│  3. 注入上下文 (this.page / this.component)                  │
│  4. 调用 __renderContent 渲染内容                            │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│  BaseRenderer (base.tsx) ⭐⭐⭐                              │
│                                                              │
│  职责：Schema → React VirtualDOM 转换引擎                    │
│  1. 核心转换方法 __createVirtualDom (递归转换)              │
│  2. 表达式解析 (JSExpression/JSFunction/JSSlot)             │
│  3. 循环渲染 (loop)                                          │
│  4. 条件渲染 (condition)                                     │
│  5. 属性解析 (__parseProps 递归解析)                         │
│  6. 生命周期管理 (constructor/mount/update/unmount)         │
│  7. 数据源管理 (DataHelper/DataSourceEngine)                │
│  8. 自定义方法绑定 (schema.methods)                          │
│  9. 样式注入 (schema.css)                                    │
│  10. HOC 包装 (leafWrapper/compWrapper)                      │
└─────────────────────────────────────────────────────────────┘
  ↓
React VirtualDOM (渲染结果)
```

### 1.2 数据流转图

```
Schema (JSON配置)
  ↓
【验证】 → 检查 componentName 是否为 Page/Component/Block/Div
  ↓
【路由】 → 根据 componentName 选择渲染器
  ↓
【初始化】 → state、dataSource、methods、lifeCycles
  ↓
【转换】 → Schema → VirtualDOM (递归转换)
  ├─ 处理 JSExpression
  ├─ 处理 loop (循环渲染)
  ├─ 处理 condition (条件渲染)
  ├─ 处理 props (属性解析)
  ├─ 处理 children (子节点递归)
  └─ 应用 HOC (leafWrapper + compWrapper)
  ↓
React VirtualDOM
  ↓
React Reconciler (React 内部)
  ↓
真实 DOM
```

---

## 二、完整工作流程（分步详解）

### 【阶段 1】初始化阶段 - 框架适配与渲染器注册 ⭐⭐⭐

#### 【步骤 1-1】注入 React 运行时到适配器
**位置**: `packages/react-renderer/src/index.ts:65-72`

```
adapter.setRuntime({
  Component,              // React.Component
  PureComponent,          // React.PureComponent
  createContext,          // React.createContext
  createElement,          // React.createElement ⭐ 最核心
  forwardRef,             // React.forwardRef
  findDOMNode             // ReactDOM.findDOMNode
})
  ↓
作用：告诉 renderer-core "我们使用 React 框架"
效果：所有 adapter.getRuntime().createElement(...) → React.createElement(...)
```

**🔥 为什么要这样设计？**
- **框架无关性**: renderer-core 代码不直接依赖 React
- **可扩展性**: 理论上可以支持其他框架（Rax/Vue），只需实现对应的适配器
- **依赖注入**: 通过适配器模式实现框架的可插拔

---

#### 【步骤 1-2】注册渲染器映射表
**位置**: `packages/react-renderer/src/index.ts:81-88`

```
adapter.setRenderers({
  PageRenderer: pageRendererFactory(),        // componentName === 'Page'
  ComponentRenderer: componentRendererFactory(), // componentName === 'Component'
  BlockRenderer: blockRendererFactory(),      // componentName === 'Block'
  AddonRenderer: addonRendererFactory(),      // componentName === 'Addon'
  TempRenderer: tempRendererFactory(),        // 临时渲染器(下钻编辑)
  DivRenderer: blockRendererFactory()         // componentName === 'Div'
})
  ↓
建立映射关系：componentName → 对应的渲染器类
  ↓
后续根据 schema.componentName 选择渲染器
```

**📋 渲染器职责划分**:
| 渲染器 | componentName | 职责 | 特性 |
|--------|---------------|------|------|
| PageRenderer | Page | 页面级渲染 | 管理页面 state、dataSource、methods |
| ComponentRenderer | Component | 自定义组件渲染 | 管理组件 state、dataSource、methods |
| BlockRenderer | Block | 区块渲染 | 轻量级，无状态管理 |
| DivRenderer | Div | Div 容器渲染 | 复用 BlockRenderer |
| AddonRenderer | Addon | 插件渲染 | 通过 appHelper.addons 访问 |
| TempRenderer | Temp | 临时渲染 | 用于下钻编辑场景 |

---

#### 【步骤 1-3】配置 ConfigProvider
**位置**: `packages/react-renderer/src/index.ts:95`

```
adapter.setConfigProvider(ConfigProvider)
  ↓ ConfigProvider 来自 @alifd/next (Fusion Design)

作用：为所有组件提供全局配置
  ├─ device: 'desktop' / 'mobile' (设备类型)
  ├─ locale: 'zh-CN' / 'en-US' (语言环境)
  ├─ theme: 主题配置
  └─ 其他全局配置

使用场景：
  - 设备类型切换时，ConfigProvider 传递 device 属性
  - 语言切换时，ConfigProvider 传递 locale 属性
```

---

#### 【步骤 1-4】创建并导出 ReactRenderer 类
**位置**: `packages/react-renderer/src/index.ts:109-176`

```
function factory(): types.IRenderComponent {
  const Renderer = rendererFactory();  // 获取通用渲染器类

  return class ReactRenderer extends Renderer implements Component {
    // React 特定类型定义
    readonly props: types.IRendererProps;
    context: ContextType<any>;
    setState: (state, callback?) => void;
    forceUpdate: (callback?) => void;
    refs: { [key: string]: ReactInstance };

    constructor(props, context) {
      super(props, context);
    }

    // 验证是否为有效的 React 组件
    isValidComponent(obj: any) {
      return obj?.prototype?.isReactComponent || obj?.prototype instanceof Component;
    }
  };
}

export default factory();  // 导出 ReactRenderer 类
  ↓
用户代码中：
import ReactRenderer from '@alilc/lowcode-react-renderer';
<ReactRenderer schema={schema} components={components} />
```

---

### 【阶段 2】渲染入口 - Schema 验证与路由分发 ⭐⭐⭐

#### 【步骤 2-1】用户调用 ReactRenderer
**位置**: 用户代码

```tsx
import ReactRenderer from '@alilc/lowcode-react-renderer';

return (
  <ReactRenderer
    className="bi-react-renderer"
    schema={schema}           // ⭐ 核心：Schema 配置
    components={components}   // ⭐ 核心：组件映射表
    appHelper={appHelper}     // 可选：工具集合
    locale="zh-CN"            // 可选：语言
    device="desktop"          // 可选：设备类型
  />
);
```

**传入的 Props**:
```typescript
interface IRendererProps {
  schema: IPublicTypeRootSchema;      // Schema 配置 (必需)
  components: Record<string, any>;    // 组件映射表 (必需)
  appHelper?: IRendererAppHelper;     // 工具助手
  className?: string;                 // 根容器类名
  locale?: string;                    // 语言环境
  device?: string;                    // 设备类型
  designMode?: string;                // 设计模式 ('design' / 'preview')
  suspended?: boolean;                // 是否暂停渲染
  thisRequiredInJSE?: boolean;        // 表达式是否要求 this
  onCompGetRef?: Function;            // 组件 ref 回调
  onCompGetCtx?: Function;            // 组件上下文回调
}
```

---

#### 【步骤 2-2】Renderer 入口验证 Schema
**位置**: `packages/renderer-core/src/renderer/renderer.tsx:181-197`

```
render() {
  const { schema } = this.props;

  // 1️⃣ 检查 Schema 是否为空
  if (isEmpty(schema)) {
    return null;
  }

  // 2️⃣ 检查 Schema 结构是否合法
  if (schema.componentName !== 'Div' && !isFileSchema(schema)) {
    logger.error('The root component name needs to be one of Page、Block、Component');
    return '模型结构异常';
  }

  ✅ 验证通过，继续下一步
}
```

**isFileSchema 判断逻辑**:
```typescript
// Page、Component、Block 都是文件类型 Schema
function isFileSchema(schema) {
  return ['Page', 'Component', 'Block'].includes(schema.componentName);
}
```

---

#### 【步骤 2-3】根据 componentName 选择渲染器
**位置**: `packages/renderer-core/src/renderer/renderer.tsx:167-179`

```
getComp() {
  const { schema, components } = this.props;
  const { componentName } = schema;

  // 合并内置渲染器和用户传入的组件
  const allComponents = { ...RENDERER_COMPS, ...components };

  // 1️⃣ 优先查找用户传入的组件
  // 2️⃣ 如果没有，查找内置渲染器 (如 'PageRenderer')
  let Comp = allComponents[componentName] ||
             RENDERER_COMPS[`${componentName}Renderer`];

  // 3️⃣ 如果找到的不是 BaseRenderer 的子类，使用内置渲染器
  if (Comp && !(Comp.prototype instanceof BaseRenderer)) {
    Comp = RENDERER_COMPS[`${componentName}Renderer`];
  }

  return Comp;
}
  ↓
示例：
  - schema.componentName === 'Page' → PageRenderer
  - schema.componentName === 'Component' → ComponentRenderer
  - schema.componentName === 'Block' → BlockRenderer
```

---

#### 【步骤 2-4】包装 Context 和 ConfigProvider
**位置**: `packages/renderer-core/src/renderer/renderer.tsx:212-239`

```
render() {
  const Comp = this.getComp();

  if (!Comp) {
    return null;
  }

  return createElement(
    AppContext.Provider,
    {
      value: {
        appHelper,           // 工具助手
        components: allComponents,  // 所有组件
        engine: this         // 渲染器引擎实例
      }
    },
    createElement(
      ConfigProvider,
      {
        device: this.props.device,    // 设备类型
        locale: this.props.locale     // 语言环境
      },
      createElement(Comp, {
        key: schema.__ctx?.lceKey,
        ref: this.__getRef,
        __appHelper: appHelper,
        __components: allComponents,
        __schema: schema,
        __designMode: designMode,
        ...this.props
      })
    )
  );
}
```

**Context 传递链**:
```
AppContext.Provider
  value: { appHelper, components, engine }
  ↓
ConfigProvider
  device, locale
  ↓
PageRenderer / ComponentRenderer / BlockRenderer
  __appHelper, __components, __schema, __designMode
```

---

### 【阶段 3】渲染器初始化 - 以 PageRenderer 为例 ⭐⭐⭐

#### 【步骤 3-1】PageRenderer 构造函数
**位置**: `packages/renderer-core/src/renderer/base.tsx:345-371`

```
constructor(props, context) {
  super(props, context);  // 调用 React.Component 构造函数

  this.context = context;  // 保存 context

  // 初始化表达式解析函数
  this.__parseExpression = (str, self) => {
    return parseExpression({
      str,                           // 表达式对象
      self,                          // 执行上下文 (this)
      thisRequired: props?.thisRequiredInJSE,
      logScope: props.componentName
    });
  };

  // 🔥 三段式初始化钩子 (模板方法模式)
  this.__beforeInit(props);  // 1️⃣ 初始化前 (子类可重写)
  this.__init(props);        // 2️⃣ 初始化 (绑定方法)
  this.__afterInit(props);   // 3️⃣ 初始化后 (子类必须重写)
}
```

---

#### 【步骤 3-2】__init - 通用初始化
**位置**: `packages/renderer-core/src/renderer/base.tsx:400-405`

```
__init(props) {
  this.__compScopes = {};        // 1️⃣ 重置作用域缓存
  this.__instanceMap = {};       // 2️⃣ 重置实例映射表
  this.__bindCustomMethods(props); // 3️⃣ 绑定 schema.methods
  this.__initI18nAPIs();         // 4️⃣ 初始化国际化 API
}
```

---

#### 【步骤 3-3】__bindCustomMethods - 绑定自定义方法
**位置**: `packages/renderer-core/src/renderer/base.tsx:748-783`

```
__bindCustomMethods(props) {
  const { __schema } = props;
  const customMethodsList = Object.keys(__schema.methods || []);

  // 🧹 清理旧方法 (防止内存泄漏)
  (this.__customMethodsList || []).forEach(item => {
    if (!customMethodsList.includes(item)) {
      delete this[item];
    }
  });

  // 更新方法列表
  this.__customMethodsList = customMethodsList;

  // 🔗 绑定新方法
  forEach(__schema.methods, (val, key) => {
    let value = val;

    // 解析 JSExpression / JSFunction
    if (isJSExpression(value) || isJSFunction(value)) {
      value = this.__parseExpression(value, this);
    }

    // 类型检查
    if (typeof value !== 'function') {
      logger.error(`custom method ${key} can not be parsed to a valid function`);
      return;
    }

    // 绑定 this 并挂载到实例
    this[key] = value.bind(this);
  });
}
```

**Schema 示例**:
```json
{
  "componentName": "Page",
  "methods": {
    "handleClick": {
      "type": "JSFunction",
      "value": "function() { console.log(this.state.count); }"
    },
    "getData": {
      "type": "JSFunction",
      "value": "function() { return this.dataSourceMap.list; }"
    }
  }
}
```

**结果**:
- `this.handleClick()` 可以直接调用
- `this.getData()` 可以直接调用

---

#### 【步骤 3-4】__afterInit - PageRenderer 特定初始化
**位置**: `packages/renderer-core/src/renderer/page.tsx:83-107`

```
__afterInit(props) {
  // 1️⃣ 注入页面上下文 (子组件可通过 this.page 访问)
  this.__generateCtx({
    page: this
  });

  const schema = props.__schema || {};

  // 2️⃣ 初始化页面状态
  this.state = this.__parseData(schema.state || {});

  // 3️⃣ 初始化数据源
  this.__initDataSource(props);

  // 4️⃣ 执行 schema.lifeCycles.constructor
  this.__executeLifeCycleMethod('constructor', [props, ...rest]);
}
```

---

#### 【步骤 3-5】__initDataSource - 初始化数据源
**位置**: `packages/renderer-core/src/renderer/base.tsx:916-1011`

```
__initDataSource(props) {
  const schema = props.__schema || {};
  const dataSource = schema.dataSource || { list: [] };

  // 判断使用哪种数据源方案
  const useDataSourceEngine = !!props.__appHelper?.requestHandlersMap;

  if (useDataSourceEngine) {
    // ========== 方案 1：数据源引擎 (新方案) ==========
    this.__dataHelper = {
      updateConfig: (updateDataSource) => {
        const { dataSourceMap, reloadDataSource } = createDataSourceEngine(
          updateDataSource ?? {},
          this,
          { requestHandlersMap: props.__appHelper.requestHandlersMap }
        );

        // 重写 reloadDataSource 方法
        this.reloadDataSource = () => new Promise(resolve => {
          reloadDataSource().then(() => resolve({}));
        });

        return dataSourceMap;
      }
    };

    this.dataSourceMap = this.__dataHelper.updateConfig(dataSource);

  } else {
    // ========== 方案 2：数据助手 (旧方案) ==========
    this.__dataHelper = new DataHelper(
      this,
      dataSource,
      appHelper,
      config => this.__parseData(config)
    );

    this.dataSourceMap = this.__dataHelper.dataSourceMap;

    this.reloadDataSource = () => new Promise((resolve, reject) => {
      if (!this.__dataHelper) {
        return resolve({});
      }

      this.__dataHelper.getInitData()
        .then(res => {
          if (isEmpty(res)) {
            return resolve({});
          }
          this.setState(res, resolve);
        })
        .catch(err => reject(err));
    });
  }
}
```

**Schema 数据源示例**:
```json
{
  "dataSource": {
    "list": [
      {
        "id": "userInfo",
        "isInit": true,
        "type": "fetch",
        "options": {
          "uri": "/api/user",
          "method": "GET",
          "params": { "id": 1 }
        },
        "dataHandler": {
          "type": "JSFunction",
          "value": "function(res) { return res.data; }"
        }
      }
    ]
  }
}
```

---

### 【阶段 4】生命周期 - componentDidMount ⭐⭐

#### 【步骤 4-1】触发 componentDidMount
**位置**: `packages/renderer-core/src/renderer/base.tsx:492-496`

```
async componentDidMount(...args) {
  this.reloadDataSource();  // 🔥 加载数据源
  this.__executeLifeCycleMethod('componentDidMount', args);
  this.__debug(`componentDidMount - ${this.props?.__schema?.fileName}`);
}
```

---

#### 【步骤 4-2】reloadDataSource - 加载数据
**位置**: `packages/renderer-core/src/renderer/base.tsx:589-612`

```
reloadDataSource = () => new Promise((resolve, reject) => {
  this.__debug('reload data source');

  if (!this.__dataHelper) {
    return resolve({});
  }

  // 获取初始数据 (isInit: true 的数据源)
  this.__dataHelper.getInitData()
    .then(res => {
      if (isEmpty(res)) {
        this.forceUpdate();
        return resolve({});
      }
      // 有数据，更新 state
      this.setState(res, resolve);
    })
    .catch(err => reject(err));
});
```

---

### 【阶段 5】渲染阶段 - Schema → VirtualDOM 转换 ⭐⭐⭐⭐⭐

#### 【步骤 5-1】PageRenderer.render 开始渲染
**位置**: `packages/renderer-core/src/renderer/page.tsx:166-212`

```
render() {
  const { __schema, __components } = this.props;

  // 1️⃣ Schema 结构验证
  if (this.__checkSchema(__schema)) {
    return '页面schema结构异常！';
  }

  // 2️⃣ 绑定自定义方法
  this.__bindCustomMethods(this.props);

  // 3️⃣ 初始化数据源
  this.__initDataSource(this.props);

  // 4️⃣ 生成页面上下文
  this.__generateCtx({ page: this });

  // 5️⃣ 执行渲染前处理
  this.__render();

  // 6️⃣ 选择渲染方式
  const { Page } = __components;
  if (Page) {
    // 用户提供了自定义 Page 组件
    return this.__renderComp(Page, { pageContext: this });
  }

  // 默认渲染
  return this.__renderContent(
    this.__renderContextProvider({ pageContext: this })
  );
}
```

---

#### 【步骤 5-2】__render - 渲染前处理
**位置**: `packages/renderer-core/src/renderer/base.tsx:1178-1201`

```
__render() {
  const schema = this.props.__schema;

  // 1️⃣ 执行用户定义的 render 生命周期
  this.__executeLifeCycleMethod('render');

  // 2️⃣ 写入 CSS 样式
  this.__writeCss(this.props);

  const { engine } = this.context;
  if (engine) {
    // 3️⃣ 通知 engine 获取上下文
    engine.props.onCompGetCtx(schema, this);

    // 设计态特殊处理
    if (this.__designModeIsDesign) {
      // 4️⃣ 重新绑定自定义方法
      this.__bindCustomMethods(this.props);

      // 5️⃣ 更新数据源配置
      this.dataSourceMap = this.__dataHelper?.updateConfig(schema.dataSource);
    }
  }
}
```

---

#### 【步骤 5-3】__createDom - 开始 Schema 转换
**位置**: `packages/renderer-core/src/renderer/base.tsx:1264-1301`

```
__createDom() {
  const { __schema, __ctx, __components = {} } = this.props;

  // 1️⃣ 合并默认属性和传入属性
  const scopeProps = {
    ...__schema.defaultProps,
    ...this.props
  };

  // 2️⃣ 创建作用域对象
  const scope = {
    props: scopeProps
  };

  // 3️⃣ 设置原型链 (使表达式可访问 this)
  scope.__proto__ = __ctx || this;

  // 4️⃣ 获取子节点
  const _children = getSchemaChildren(__schema);

  // 5️⃣ 获取根组件类
  let Comp = __components[__schema.componentName];

  // 6️⃣ 应用 HOC 包装
  const parentNodeInfo = {
    schema: __schema,
    Comp: this.__getHOCWrappedComponent(Comp, __schema, scope)
  };

  // 7️⃣ 递归转换子节点为虚拟 DOM
  return this.__createVirtualDom(_children, scope, parentNodeInfo);
}
```

---

#### 【步骤 5-4】__createVirtualDom - 核心转换引擎 ⭐⭐⭐⭐⭐
**位置**: `packages/renderer-core/src/renderer/base.tsx:1322-1604`

这是整个渲染器最核心的方法，负责将 Schema 递归转换为 React VirtualDOM。

```
【处理流程图】

originalSchema (输入)
  ↓
┌─────────────────────────────────────┐
│ 1️⃣ 特殊类型处理                     │
├─────────────────────────────────────┤
│ • JSExpression → 执行表达式          │
│ • i18n → 国际化转换                  │
│ • JSSlot → 插槽渲染                  │
│ • string/number/boolean → 直接返回  │
│ • Array → 递归处理每个元素          │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 2️⃣ 组件验证                        │
├─────────────────────────────────────┤
│ • componentName 必须存在            │
│ • 组件必须在 components 中注册      │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 3️⃣ 循环渲染 (loop)                 │
├─────────────────────────────────────┤
│ • 解析 loop 数据                    │
│ • 创建循环作用域 (item, index)     │
│ • 递归渲染每个循环项                │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 4️⃣ 条件渲染 (condition)            │
├─────────────────────────────────────┤
│ • 解析 condition 表达式             │
│ • false 则不渲染 (运行态)           │
│ • 设计态始终渲染                    │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 5️⃣ 作用域处理 (generateScope)      │
├─────────────────────────────────────┤
│ • 为组件生成独立作用域              │
│ • 缓存作用域 (__compScopes)         │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 6️⃣ 属性解析 (__parseProps)         │
├─────────────────────────────────────┤
│ • 递归解析 schema.props             │
│ • 转换 JSExpression                 │
│ • 转换 JSFunction                   │
│ • 转换 JSSlot (render props)        │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 7️⃣ HOC 包装                        │
├─────────────────────────────────────┤
│ • leafWrapper (设计态响应式更新)    │
│ • compWrapper (错误边界)            │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 8️⃣ 子节点转换                      │
├─────────────────────────────────────┤
│ • 递归调用 __createVirtualDom       │
│ • 转换 children                     │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 9️⃣ 创建 React 元素                 │
├─────────────────────────────────────┤
│ • engine.createElement(Comp, props, │
│                        children)    │
└─────────────────────────────────────┘
  ↓
React VirtualDOM (输出)
```

---

#### 【步骤 5-5】__parseProps - 属性解析引擎 ⭐⭐⭐⭐
**位置**: `packages/renderer-core/src/renderer/base.tsx:1950-2145`

```
【属性解析流程图】

originalProps (输入)
  ↓
【类型判断与转换】
  │
  ├─ 1️⃣ JSExpression → 执行表达式
  │   └─ { type: 'JSExpression', value: 'this.state.count + 1' }
  │       → 6 (假设 count = 5)
  │
  ├─ 2️⃣ i18n → 国际化转换
  │   └─ { type: 'i18n', key: 'app.title' }
  │       → "应用标题" (根据当前语言)
  │
  ├─ 3️⃣ variable → 变量绑定 (旧平台兼容)
  │   └─ { variable: 'userInfo' }
  │       → this.dataSourceMap.userInfo
  │
  ├─ 4️⃣ JSFunction → 转换为函数
  │   └─ { type: 'JSFunction', value: 'function() { ... }' }
  │       → function() { ... }
  │
  ├─ 5️⃣ JSSlot → 插槽 (render props)
  │   ├─ 无参数: 直接渲染 Schema
  │   │   └─ { type: 'JSSlot', value: { componentName: 'Button' } }
  │   │       → <Button />
  │   │
  │   └─ 有参数: 返回 render props 函数
  │       └─ { type: 'JSSlot', params: ['data', 'index'],
  │                            value: { componentName: 'Button' } }
  │           → (data, index) => <Button>{data.name}</Button>
  │
  ├─ 6️⃣ Schema → 组件对象
  │   └─ { componentName: 'Button', props: { children: '按钮' } }
  │       → <Button>按钮</Button>
  │
  ├─ 7️⃣ Array → 递归处理每个元素
  │   └─ [
  │         { type: 'JSExpression', value: 'item1' },
  │         { type: 'JSExpression', value: 'item2' }
  │       ]
  │       → ['值1', '值2']
  │
  ├─ 8️⃣ Function → 绑定 scope
  │   └─ function() { ... }
  │       → function() { ... }.bind(scope)
  │
  ├─ 9️⃣ Object → 递归处理每个属性
  │   └─ {
  │         style: {
  │           color: { type: 'JSExpression', value: 'this.state.color' },
  │           fontSize: 14
  │         }
  │       }
  │       → { style: { color: '#333', fontSize: 14 } }
  │
  └─ 🔟 基础类型 → 直接返回
      └─ 'string', 123, true, null
          → 'string', 123, true, null
  ↓
解析后的属性值 (输出)
```

---

### 【阶段 6】特殊场景处理 ⭐⭐

#### 【场景 1】循环渲染 (loop)
**位置**: `packages/renderer-core/src/renderer/base.tsx:1828-1877`

```
Schema 示例：
{
  "componentName": "Button",
  "loop": [
    { "id": 1, "name": "按钮1" },
    { "id": 2, "name": "按钮2" },
    { "id": 3, "name": "按钮3" }
  ],
  "loopArgs": ["item", "index"],
  "props": {
    "key": { "type": "JSExpression", "value": "item.id" },
    "children": { "type": "JSExpression", "value": "item.name" }
  }
}

【处理流程】
  ↓
解析 loop 数据 → [{ id: 1, name: "按钮1" }, ...]
  ↓
遍历 loop 数组
  ↓
为每个元素创建循环作用域:
  loopSelf = {
    item: { id: 1, name: "按钮1" },
    index: 0,
    __proto__: scope  // 继承父级作用域
  }
  ↓
递归调用 __createVirtualDom(schema, loopSelf, ...)
  ↓
结果：
[
  <Button key="1">按钮1</Button>,
  <Button key="2">按钮2</Button>,
  <Button key="3">按钮3</Button>
]
```

---

#### 【场景 2】条件渲染 (condition)
**位置**: `packages/renderer-core/src/renderer/base.tsx:1468-1474`

```
Schema 示例：
{
  "componentName": "Button",
  "condition": {
    "type": "JSExpression",
    "value": "this.state.visible"
  },
  "props": {
    "children": "点击"
  }
}

【处理流程】
  ↓
解析 condition 表达式
  ↓
const condition = this.__parseData(schema.condition, scope);
// 结果: true / false
  ↓
判断渲染：
  - 运行态: condition === false → return null (不渲染)
  - 设计态: 始终渲染 (displayInHook === true)
  ↓
结果：
  - visible === true → <Button>点击</Button>
  - visible === false (运行态) → null
  - visible === false (设计态) → <Button style={{opacity: 0.5}}>点击</Button>
```

---

#### 【场景 3】JSSlot 插槽 (render props)
**位置**: `packages/renderer-core/src/renderer/base.tsx:1993-2023`

```
Schema 示例 1: 无参数插槽
{
  "componentName": "Card",
  "props": {
    "title": {
      "type": "JSSlot",
      "value": {
        "componentName": "Text",
        "props": { "children": "卡片标题" }
      }
    }
  }
}

【处理流程】
  ↓
检测到 JSSlot
  ↓
params 为空，直接渲染
  ↓
const virtualDom = this.__createVirtualDom(slot.value, scope, info);
  ↓
结果：
<Card title={<Text>卡片标题</Text>} />

───────────────────────────────────────

Schema 示例 2: 有参数插槽 (render props)
{
  "componentName": "Table",
  "props": {
    "columns": [
      {
        "title": "姓名",
        "dataIndex": "name",
        "cell": {
          "type": "JSSlot",
          "params": ["value", "index", "record"],
          "value": {
            "componentName": "Link",
            "props": {
              "children": { "type": "JSExpression", "value": "value" }
            }
          }
        }
      }
    ]
  }
}

【处理流程】
  ↓
检测到 JSSlot，params = ["value", "index", "record"]
  ↓
返回 render props 函数:
(...argValues) => {
  const args = {
    value: argValues[0],
    index: argValues[1],
    record: argValues[2],
    __proto__: scope
  };

  return this.__createVirtualDom(slot.value, args, info);
}
  ↓
结果：
<Table
  columns={[
    {
      title: "姓名",
      dataIndex: "name",
      cell: (value, index, record) => <Link>{value}</Link>
    }
  ]}
/>
```

---

### 【阶段 7】HOC 包装 ⭐⭐

#### 【HOC 1】leafWrapper - 设计态响应式更新
**位置**: `packages/renderer-core/src/hoc/leaf.tsx`

```
作用：监听 Schema 变化，实现最小渲染单元优化

应用场景：设计态 (designMode === 'design')

功能：
1️⃣ 监听 Schema 变化 (props、children、visible)
2️⃣ Schema 变化时，只更新当前组件，不影响兄弟组件
3️⃣ 实现设计态的响应式编辑

实现原理：
class LeafHoc extends Component {
  shouldComponentUpdate(nextProps) {
    // 比较 Schema 是否变化
    if (isSchemaChanged(this.props.__schema, nextProps.__schema)) {
      return true;  // Schema 变化，重新渲染
    }
    return false;  // Schema 未变化，跳过渲染
  }

  render() {
    return <WrappedComponent {...this.props} />;
  }
}
```

---

#### 【HOC 2】compWrapper - 错误边界
**位置**: `packages/renderer-core/src/hoc/index.tsx`

```
作用：捕获组件渲染错误，防止整个应用崩溃

应用场景：设计态 + 运行态 (所有环境)

功能：
1️⃣ 捕获子组件抛出的错误
2️⃣ 显示错误 UI (而不是白屏)
3️⃣ 记录错误日志

实现原理：
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  componentDidCatch(error, errorInfo) {
    this.setState({ hasError: true, error });
    logger.error('Component render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorComponent error={this.state.error} />;
    }
    return <WrappedComponent {...this.props} />;
  }
}
```

---

### 【阶段 8】最终输出 ⭐

#### 【步骤 8-1】生成 React VirtualDOM

```
经过以上所有处理后，最终输出 React VirtualDOM 树：

<AppContext.Provider value={{...}}>
  <ConfigProvider device="desktop" locale="zh-CN">
    <div className="lce-page page-xxx">
      <RootContentNew layout={[...]}>
        <IndicatorCard {...props} />
        <SingleIndicatorCard {...props} />
        <PieChart {...props} />
        <Text {...props} />
        <Table {...props} />
        <GlobalFilter {...props} />
      </RootContentNew>
    </div>
  </ConfigProvider>
</AppContext.Provider>
```

---

#### 【步骤 8-2】React Reconciler 协调

```
React VirtualDOM
  ↓
React Reconciler (Diff 算法)
  ↓
计算最小更新操作
  ↓
Commit 阶段
  ↓
真实 DOM
```

---

## 三、核心设计模式与原理

### 3.1 适配器模式 (Adapter Pattern)

**目的**: 抹平不同框架的 API 差异

```
【架构图】

renderer-core (框架无关)
  ↓ 依赖
adapter (统一接口)
  ↓ 实现
React / Rax / Vue (具体框架)
```

**优点**:
- 代码复用性高
- 框架可插拔
- 易于扩展

**实现**:
```typescript
// 定义统一接口
interface IRuntime {
  Component: any;
  createElement: Function;
  // ...
}

// React 适配
adapter.setRuntime({
  Component: React.Component,
  createElement: React.createElement
});

// renderer-core 使用
const { createElement } = adapter.getRuntime();
createElement('div', { className: 'xxx' });
```

---

### 3.2 工厂模式 (Factory Pattern)

**目的**: 根据 componentName 动态创建渲染器

```
【流程图】

schema.componentName
  ↓
rendererFactory()
  ├─ 'Page' → PageRenderer
  ├─ 'Component' → ComponentRenderer
  ├─ 'Block' → BlockRenderer
  └─ 'Div' → DivRenderer
```

**实现**:
```typescript
function getComp() {
  const { componentName } = schema;
  return RENDERER_COMPS[`${componentName}Renderer`];
}
```

---

### 3.3 模板方法模式 (Template Method Pattern)

**目的**: 定义算法骨架，子类实现具体步骤

```
【BaseRenderer 算法骨架】

constructor(props) {
  this.__beforeInit(props);  // ← 子类可重写
  this.__init(props);        // ← 通用逻辑
  this.__afterInit(props);   // ← 子类必须重写
}
```

**子类实现**:
```typescript
// PageRenderer
__afterInit(props) {
  this.__generateCtx({ page: this });
  this.state = this.__parseData(schema.state);
  this.__initDataSource(props);
}

// ComponentRenderer
__afterInit(props) {
  this.__generateCtx({ component: this });
  this.state = this.__parseData(schema.state);
  this.__initDataSource(props);
}

// BlockRenderer
__afterInit(props) {
  this.__generateCtx({});  // 无特殊上下文
}
```

---

### 3.4 递归 (Recursion)

**目的**: 处理树形结构的 Schema

```
【递归调用链】

__createVirtualDom(schema, scope, parentInfo)
  ↓
处理当前节点
  ├─ 解析 props
  ├─ 处理 loop
  ├─ 处理 condition
  └─ 递归处理 children
      ↓
      __createVirtualDom(child1, scope, parentInfo)
      __createVirtualDom(child2, scope, parentInfo)
      __createVirtualDom(child3, scope, parentInfo)
          ↓
          继续递归...
```

---

### 3.5 作用域链 (Scope Chain)

**目的**: 实现表达式的上下文访问

```
【作用域链结构】

scope (当前作用域)
  ├─ props: { ... }
  ├─ item: { ... }      // 循环变量
  ├─ index: 0           // 循环索引
  └─ __proto__: this    // 原型链指向渲染器实例
      ├─ state: { ... }
      ├─ dataSourceMap: { ... }
      ├─ methods: { ... }
      └─ page: { ... }

表达式访问：
  - this.state.count → scope.__proto__.state.count
  - item.name → scope.item.name
  - props.title → scope.props.title
```

---

## 四、关键知识点与注意事项

### 4.1 文档中不存在的知识点

#### 🔥 知识点 1: __compScopes 组件作用域缓存机制

**位置**: `base.tsx:1478-1502`

```typescript
// 判断组件是否需要生成 scope，且只生成一次
if (Comp.generateScope) {
  const key = this.__parseExpression(schema.props?.key, scope);
  if (key) {
    scopeKey = key;
  } else if (!schema.__ctx) {
    schema.__ctx = { lceKey: `lce${++scopeIdx}` };
    scopeKey = schema.__ctx.lceKey;
  } else {
    scopeKey = schema.__ctx.lceKey + (idx !== undefined ? `_${idx}` : '');
  }

  if (!this.__compScopes[scopeKey]) {
    this.__compScopes[scopeKey] = Comp.generateScope(this, schema);
  }
}
```

**作用**: 为需要独立作用域的组件缓存作用域对象，避免重复生成。

**使用场景**: 自定义组件需要维护独立的状态和数据。

---

#### 🔥 知识点 2: 设计态的特殊处理

**位置**: `base.tsx:1507-1586`

```typescript
// 设计态需要进入 leaf Hoc，进行相关事件注册
const displayInHook = this.__designModeIsDesign;
if (!condition && !displayInHook) {
  return null;
}

// 设计态下，添加随机 __tag（用于强制更新）
if (this.__designModeIsDesign) {
  otherProps.__tag = Math.random();
}

// 虚拟 DOM 显示 (设计态专用)
if (componentInfo?.parentRule) {
  const parentList = componentInfo.parentRule.split(',');
  if (!parentList.includes(parentSchema.componentName)) {
    props.__componentName = schema.componentName;
    Comp = VisualDom;  // 显示占位符
  }
}
```

**设计态 vs 运行态**:

| 特性 | 设计态 | 运行态 |
|------|--------|--------|
| condition=false | 显示半透明占位 | 不渲染 (null) |
| leafWrapper | 应用 (响应式更新) | 不应用 |
| 重新绑定方法 | 每次 render 都绑定 | 只绑定一次 |
| __tag | 随机值 (强制更新) | 无 |
| VisualDom | 显示 (不符合父规则时) | 不显示 |

---

#### 🔥 知识点 3: 两种数据源方案

**位置**: `base.tsx:932-1011`

```typescript
const useDataSourceEngine = !!props.__appHelper?.requestHandlersMap;

if (useDataSourceEngine) {
  // 方案 1: 数据源引擎 (新方案)
  const { dataSourceMap, reloadDataSource } = createDataSourceEngine(...);
} else {
  // 方案 2: 数据助手 (旧方案)
  this.__dataHelper = new DataHelper(...);
}
```

**对比**:

| 特性 | DataSourceEngine (新) | DataHelper (旧) |
|------|-----------------------|-----------------|
| 依赖管理 | 支持 (自动处理依赖关系) | 不支持 |
| 并发请求 | 优化 (自动合并) | 无优化 |
| 错误处理 | 统一处理 | 各自处理 |
| 性能 | 更好 | 一般 |
| 兼容性 | 需要 requestHandlersMap | 兼容所有环境 |

**选择建议**: 优先使用 DataSourceEngine (需要配置 requestHandlersMap)。

---

#### 🔥 知识点 4: HOC 应用顺序

**位置**: `base.tsx:1632-1639`

```typescript
get __componentHOCs(): IComponentConstruct[] {
  if (this.__designModeIsDesign) {
    return [leafWrapper, compWrapper];
  }
  return [compWrapper];
}
```

**包装顺序**:
```
OriginalComp
  ↓ leafWrapper (设计态)
LeafHoc(OriginalComp)
  ↓ compWrapper (所有环境)
ErrorBoundary(LeafHoc(OriginalComp))
```

**为什么这样设计？**
- leafWrapper 需要监听 Schema 变化，必须在最内层
- compWrapper 需要捕获所有错误，必须在最外层

---

#### 🔥 知识点 5: ref 收集机制

**位置**: `base.tsx:1526-1533`

```typescript
otherProps.ref = (ref: any) => {
  this.$(props.fieldId || props.ref, ref);  // 收集 ref

  const refProps = props.ref;
  if (refProps && typeof refProps === 'string') {
    this[refProps] = ref;  // 同时挂载到 this
  }

  ref && engine.props?.onCompGetRef(schema, ref);  // 通知 engine
};
```

**三种访问方式**:
```typescript
// 1. 通过 $() 方法访问
const buttonRef = this.$('myButton');

// 2. 通过 this 直接访问
const buttonRef = this.myButton;

// 3. 设计器通过 onCompGetRef 访问
engine.props.onCompGetRef(schema, ref);
```

---

### 4.2 性能优化点

#### ⚡ 优化 1: shouldComponentUpdate

**位置**: `base.tsx:632-640`

```typescript
shouldComponentUpdate() {
  // Schema 变化时，触发容器重渲染，当前组件不更新
  if (this.props.getSchemaChangedSymbol?.() && this.props.__container?.rerender) {
    this.props.__container?.rerender();
    return false;
  }
  return true;
}
```

**优化原理**: 设计态 Schema 变化时，重渲染整个画布，避免局部更新导致状态不一致。

---

#### ⚡ 优化 2: 表达式缓存 (TODO)

**位置**: `base.tsx:103`

```typescript
// TODO: cache - 可以缓存解析后的函数，避免重复解析
if (isJSExpression(fn) || isJSFunction(fn)) {
  fn = parseExpression(fn, context);  // 每次都解析，性能损耗
}
```

**优化建议**: 缓存解析后的函数，避免重复解析。

```typescript
// 优化方案
const expressionCache = new Map();

function parseExpressionWithCache(expr, context) {
  const key = expr.value;
  if (!expressionCache.has(key)) {
    expressionCache.set(key, parseExpression(expr, context));
  }
  return expressionCache.get(key);
}
```

---

#### ⚡ 优化 3: 单元素数组优化

**位置**: `base.tsx:1376-1378`

```typescript
if (Array.isArray(schema)) {
  // 优化：只有一个元素时直接返回
  if (schema.length === 1) {
    return this.__createVirtualDom(schema[0], scope, parentInfo);
  }
  // 多个元素时才使用 map
  return schema.map((item, idy) => ...);
}
```

**优化原理**: 避免单元素数组被包裹在数组中，减少不必要的 React 节点层级。

---

### 4.3 常见陷阱与注意事项

#### ⚠️ 陷阱 1: 循环渲染的 key 必须动态

**位置**: `base.tsx:1866-1870`

```typescript
// ❌ 错误：key 为常量，会导致 key 重复
{
  "loop": [...],
  "props": {
    "key": "constant-key"  // 所有循环项的 key 都是 "constant-key"
  }
}

// ✅ 正确：key 为表达式，使用循环项的唯一标识
{
  "loop": [...],
  "props": {
    "key": { "type": "JSExpression", "value": "item.id" }
  }
}
```

---

#### ⚠️ 陷阱 2: this 绑定问题

**位置**: `base.tsx:355-362`

```typescript
// 表达式解析时，thisRequired 参数很重要
this.__parseExpression = (str, self) => {
  return parseExpression({
    str,
    self,
    thisRequired: props?.thisRequiredInJSE,  // ⭐ 关键参数
    logScope: props.componentName
  });
};
```

**默认行为**:
- `thisRequiredInJSE = true`: 表达式必须以 `this.` 开头
- `thisRequiredInJSE = false`: 表达式可以直接访问 scope 属性

**示例**:
```javascript
// thisRequiredInJSE = true
"this.state.count"  // ✅ 正确
"state.count"       // ❌ 错误

// thisRequiredInJSE = false
"this.state.count"  // ✅ 正确
"state.count"       // ✅ 正确 (自动绑定到 scope)
```

---

#### ⚠️ 陷阱 3: 设计态的内存泄漏

**位置**: `base.tsx:1194-1198`

```typescript
// 设计态下，每次 render 都重新绑定方法和数据源
if (this.__designModeIsDesign) {
  this.__bindCustomMethods(this.props);
  this.dataSourceMap = this.__dataHelper?.updateConfig(schema.dataSource);
}
```

**风险**: 如果不清理旧方法，可能导致内存泄漏。

**解决方案**: `__bindCustomMethods` 中有清理逻辑。

```typescript
// 清理旧方法
(this.__customMethodsList || []).forEach(item => {
  if (!customMethodsList.includes(item)) {
    delete this[item];  // 删除不再存在的方法
  }
});
```

---

## 五、总结

### 5.1 核心能力

ReactRenderer 提供的核心能力：

1. **Schema → VirtualDOM 转换**: 递归将 JSON 配置转换为 React 组件树
2. **表达式解析**: JSExpression、JSFunction、JSSlot 等动态表达式
3. **循环渲染**: 支持数组循环渲染 (loop)
4. **条件渲染**: 支持条件显示/隐藏 (condition)
5. **数据源管理**: 自动加载和管理数据源
6. **生命周期**: 完整的组件生命周期支持
7. **自定义方法**: Schema 中定义的方法自动绑定到实例
8. **国际化**: 内置 i18n 支持
9. **错误边界**: 自动捕获组件错误
10. **设计态优化**: 响应式更新和实时预览

---

### 5.2 架构优势

1. **框架无关**: 通过适配器模式实现框架可插拔
2. **高度可扩展**: 工厂模式、模板方法模式等设计模式的应用
3. **性能优化**: shouldComponentUpdate、leafWrapper 等优化手段
4. **错误处理**: compWrapper 错误边界，防止应用崩溃
5. **类型安全**: 完整的 TypeScript 类型定义

---

### 5.3 适用场景

ReactRenderer 适用于：

✅ 低代码平台 (拖拽生成 Schema)
✅ 动态表单 (Schema 定义表单结构)
✅ 动态布局 (Schema 定义页面布局)
✅ 可视化搭建 (设计器 + 渲染器)
✅ 跨端渲染 (Schema 一次定义，多端渲染)

---

### 5.4 学习路径建议

如果你想深入学习 ReactRenderer，建议按以下顺序：

```
第 1 步：理解 Schema 结构
  ├─ 阅读 Schema 规范
  └─ 分析线上环境的 Schema 示例

第 2 步：理解渲染流程
  ├─ 阅读 renderer.tsx (路由分发)
  ├─ 阅读 page.tsx (PageRenderer)
  └─ 阅读 base.tsx (__createVirtualDom 核心方法)

第 3 步：理解表达式解析
  ├─ 阅读 parseExpression
  ├─ 阅读 __parseProps
  └─ 阅读 __parseData

第 4 步：理解数据源
  ├─ 阅读 DataHelper
  └─ 阅读 DataSourceEngine

第 5 步：理解 HOC
  ├─ 阅读 leafWrapper
  └─ 阅读 compWrapper

第 6 步：实战练习
  ├─ 自己编写简单的 Schema
  ├─ 调试渲染流程
  └─ 扩展自定义渲染器
```

---

## 六、后续详细步骤预告

接下来我会按以下步骤详细讲解：

**步骤 1**: 适配器模式详解 - adapter 的实现原理
**步骤 2**: 渲染器路由详解 - renderer.tsx 的分发逻辑
**步骤 3**: PageRenderer 详解 - 页面级渲染器的完整流程
**步骤 4**: BaseRenderer 详解 (上) - __createVirtualDom 的实现
**步骤 5**: BaseRenderer 详解 (下) - __parseProps 的实现
**步骤 6**: 表达式解析详解 - JSExpression/JSFunction/JSSlot
**步骤 7**: 循环渲染详解 - loop 的实现原理
**步骤 8**: 条件渲染详解 - condition 的实现原理
**步骤 9**: 数据源详解 (上) - DataHelper 的实现
**步骤 10**: 数据源详解 (下) - DataSourceEngine 的实现
**步骤 11**: HOC 详解 (上) - leafWrapper 的实现
**步骤 12**: HOC 详解 (下) - compWrapper 的实现
**步骤 13**: 设计态优化详解 - 响应式更新的实现
**步骤 14**: 性能优化详解 - 各种优化手段的原理
**步骤 15**: 实战案例 - 从 Schema 到渲染的完整过程

---

**文件保存位置**: `/Users/bjhl/Documents/ProjectMe/Fork源码学习/FORK-lowcode-engine/学习笔记/074-ReactRenderer完整工作流程总览.md`

