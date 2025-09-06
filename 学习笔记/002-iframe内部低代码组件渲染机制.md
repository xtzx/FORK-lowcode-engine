# iframe 内部低代码组件渲染机制

## 概述

iframe 渲染完成后，内部的低代码组件渲染由 `SimulatorRenderer` 负责。它接收来自设计器的 Schema（搭建协议），通过 React 渲染器将其转换为实际的 UI 组件。

## 核心渲染器架构

### 1. SimulatorRenderer（模拟器渲染器）
- **位置**：`packages/react-simulator-renderer/src/renderer.ts`
- **职责**：
  - 管理文档实例（DocumentInstance）
  - 处理组件库加载
  - 协调渲染流程
  - 与设计器通信

### 2. LowCodeRenderer（低代码渲染器）
- **位置**：`packages/react-renderer/src/index.ts` 和 `packages/renderer-core/src`
- **职责**：
  - 将 Schema 转换为 React 组件
  - 处理组件的属性解析
  - 管理生命周期
  - 处理数据绑定和表达式

## 组件渲染流程

### 整体流程图

```
Schema（搭建协议）
    ↓
SimulatorRenderer（模拟器渲染器）
    ├── DocumentInstance（文档实例管理）
    └── SimulatorRendererView（视图渲染）
        └── LowCodeRenderer（核心渲染器）
            ├── Renderer（入口渲染器）
            │   ├── 解析 Schema
            │   ├── 查找对应组件
            │   └── 创建 React Element
            └── BaseRenderer（基础渲染器）
                ├── 处理属性（props）
                ├── 处理子组件（children）
                ├── 处理生命周期
                └── 处理数据源
```

### 详细渲染步骤

#### 步骤1：SimulatorRenderer 初始化
```javascript
// packages/react-simulator-renderer/src/renderer.ts
export class SimulatorRendererContainer {
    constructor() {
        // 监听文档变化
        host.designer.currentDocument?.onRendererReady(() => {
            this.rerender();
        });

        // 创建文档实例
        const documentInstance = new DocumentInstance(
            container,
            document,
            this.device
        );
    }

    run() {
        // 开始渲染
        this.mount();
    }
}
```

#### 步骤2：渲染视图组件
```javascript
// packages/react-simulator-renderer/src/renderer-view.tsx
class Renderer extends Component {
    render() {
        const { documentInstance, rendererContainer } = this.props;
        const { container, document } = documentInstance;

        return (
            <LowCodeRenderer
                locale={locale}
                messages={messages}
                schema={documentInstance.schema}  // Schema 数据
                components={container.components}  // 组件库
                appHelper={container.context}      // 应用上下文
                designMode={designMode}            // 设计模式
                customCreateElement={(...) => {
                    // 自定义元素创建逻辑
                    // 处理设计态特殊需求
                }}
            />
        );
    }
}
```

#### 步骤3：LowCodeRenderer 处理
```javascript
// packages/renderer-core/src/renderer/renderer.tsx
export default function rendererFactory(): IRenderComponent {
    return class Renderer extends Component {
        render() {
            const { schema, components } = this.props;

            // 1. 验证 Schema
            if (isEmpty(schema)) {
                return null;
            }

            // 2. 查找对应的渲染器
            const Comp = this.getComp();
            // PageRenderer / ComponentRenderer / BlockRenderer

            // 3. 创建上下文和渲染组件
            return createElement(
                AppContext.Provider,
                {
                    value: {
                        appHelper,
                        components: allComponents,
                        engine: this,
                    }
                },
                createElement(Comp, {
                    __schema: schema,
                    __components: allComponents,
                    __designMode: designMode,
                    ...this.props
                })
            );
        }
    }
}
```

#### 步骤4：BaseRenderer 处理组件树
```javascript
// packages/renderer-core/src/renderer/base.tsx
class BaseRenderer extends Component {
    // 创建 DOM 结构
    __createDom = () => {
        const { __schema, __components } = this.props;
        const children = getSchemaChildren(__schema);

        // 递归创建虚拟 DOM
        return this.__createVirtualDom(children, scope, parentInfo);
    };

    // 核心渲染方法：将 Schema 转换为 React Element
    __createVirtualDom = (schema, scope, parentInfo) => {
        // 1. 处理表达式
        if (isJSExpression(schema)) {
            return this.__parseExpression(schema, scope);
        }

        // 2. 处理国际化
        if (isI18nData(schema)) {
            return parseI18n(schema, scope);
        }

        // 3. 处理插槽
        if (isJSSlot(schema)) {
            return this.__createVirtualDom(schema.value, scope, parentInfo);
        }

        // 4. 处理基础类型
        if (typeof schema === 'string' || typeof schema === 'number') {
            return String(schema);
        }

        // 5. 处理数组（多个子组件）
        if (Array.isArray(schema)) {
            return schema.map(item =>
                this.__createVirtualDom(item, scope, parentInfo)
            );
        }

        // 6. 处理组件节点
        if (isSchema(schema)) {
            const { componentName } = schema;
            const Component = components[componentName];

            if (!Component) {
                // 组件未找到，使用 NotFoundComponent
                return createElement(NotFoundComponent, props);
            }

            // 解析属性
            const props = this.__parseProps(schema.props, scope);

            // 处理循环
            if (isUseLoop(schema)) {
                return this.__createLoopVirtualDom(schema, scope);
            }

            // 处理条件渲染
            if (schema.condition) {
                const conditionValue = this.__parseExpression(
                    schema.condition,
                    scope
                );
                if (!conditionValue) {
                    return null;
                }
            }

            // 创建组件实例
            return engine.createElement(
                Component,
                props,
                this.__createVirtualDom(children, scope, nodeInfo)
            );
        }
    };
}
```

## Schema 结构与渲染规则

### Schema 基本结构
```javascript
{
    componentName: 'Page',         // 组件名称
    props: {                        // 组件属性
        className: 'page-container',
        style: { padding: '20px' }
    },
    children: [                     // 子组件
        {
            componentName: 'Button',
            props: {
                type: 'primary',
                onClick: {          // JSExpression
                    type: 'JSExpression',
                    value: 'this.handleClick'
                }
            },
            children: '点击按钮'
        }
    ],
    lifeCycles: {                   // 生命周期
        componentDidMount: {
            type: 'JSFunction',
            value: 'function() { console.log("mounted"); }'
        }
    }
}
```

### 渲染规则

#### 1. 组件查找规则
```javascript
// 查找优先级
const allComponents = {
    ...RENDERER_COMPS,      // 内置渲染器（PageRenderer等）
    ...components           // 用户传入的组件库
};

// 查找顺序
let Comp = allComponents[componentName] ||
           RENDERER_COMPS[`${componentName}Renderer`];
```

#### 2. 属性解析规则
- **JSExpression**：解析为 JavaScript 表达式
- **JSFunction**：解析为函数
- **JSSlot**：解析为插槽内容
- **I18nData**：解析为国际化文本
- **普通值**：直接传递

#### 3. 循环渲染（loop）
```javascript
// Schema 中的 loop 配置
{
    componentName: 'List',
    loop: {
        type: 'JSExpression',
        value: 'this.state.items'
    },
    loopArgs: ['item', 'index'],   // 循环参数
    children: {
        componentName: 'ListItem',
        props: {
            key: {
                type: 'JSExpression',
                value: 'item.id'
            }
        }
    }
}
```

#### 4. 条件渲染（condition）
```javascript
{
    componentName: 'Alert',
    condition: {                   // 条件表达式
        type: 'JSExpression',
        value: 'this.state.showAlert'
    },
    props: { ... }
}
```

## 设计态特殊处理

### 1. 组件包装（HOC）
设计态下，组件会被高阶组件（HOC）包装，添加额外功能：
- **Leaf HOC**：添加选中、悬停等交互能力
- **compWrapper**：处理组件实例引用

### 2. 自定义 createElement
```javascript
customCreateElement: (Component, props, children) => {
    // 获取组件元数据
    const componentMeta = host.getComponentMeta(Component.displayName);

    // 特殊处理（如模态框不渲染）
    if (componentMeta?.isModal) {
        return null;
    }

    // 添加设计态属性
    const viewProps = {
        ...props,
        _leaf: {            // 设计态标记
            isEmpty: () => false,
            isMock: true
        }
    };

    return createElement(Component, viewProps, children);
}
```

### 3. 事件处理
设计态下的事件会被拦截和处理：
```javascript
// 设计态不执行真实的事件处理函数
if (designMode === 'design') {
    props.onClick = (e) => {
        e.stopPropagation();
        // 触发设计器的选中逻辑
        designer.selectNode(nodeId);
    };
}
```

## 数据源与状态管理

### 1. 数据源初始化
```javascript
__initDataSource(props) {
    const schema = props.__schema;
    const dataSource = schema.dataSource;

    if (dataSource) {
        const dataSourceEngine = createDataSourceEngine(
            dataSource,
            this,
            appHelper.requestHandlersMap
        );

        this.dataSourceMap = dataSourceEngine.dataSourceMap;
    }
}
```

### 2. 状态管理
- **组件状态**：通过 this.state 管理
- **全局状态**：通过 appHelper 共享
- **数据源状态**：通过 dataSourceMap 管理

## 性能优化

### 1. 组件缓存
- 使用 `__instanceMap` 缓存组件实例
- 避免重复创建相同组件

### 2. 条件渲染优化
- 提前判断条件，避免无效渲染
- 使用 `shouldComponentUpdate` 控制更新

### 3. Schema 变化检测
```javascript
getSchemaChangedSymbol = () => {
    return this.schemaChangedSymbol;
};

// 只在 Schema 真正变化时重新渲染
if (schemaChanged) {
    this.forceUpdate();
}
```

## 注意事项

### 1. 组件库要求
- 组件必须在 iframe 内可访问
- 组件名称必须与 Schema 中的 componentName 对应
- 支持 React 组件和低代码组件

### 2. 表达式安全
- JSExpression 在沙箱环境中执行
- 避免直接访问 window 对象
- 使用 this 访问组件上下文

### 3. 生命周期执行
- constructor：组件创建时
- componentDidMount：组件挂载后
- componentDidUpdate：组件更新后
- componentWillUnmount：组件卸载前

### 4. 错误处理
- 组件渲染错误会被 FaultComponent 捕获
- 组件未找到会显示 NotFoundComponent
- 表达式执行错误会记录日志

## 扩展机制

### 1. 自定义渲染器
```javascript
// 注册自定义渲染器
adapter.setRenderers({
    CustomRenderer: customRendererFactory()
});
```

### 2. 自定义组件
```javascript
// 注册自定义组件
const components = {
    MyButton: MyButtonComponent,
    MyTable: MyTableComponent
};
```

### 3. 自定义 HOC
```javascript
// 添加自定义高阶组件
this.__componentHOCs.push(myCustomHOC);
```
