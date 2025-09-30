我来为你详细分析 **Common 模块**的功能、关联模块和底层原理。
Ran tool

Ran tool
Ran tool
Ran tool

Ran tool
Ran tool
Ran tool

Ran tool
Ran tool
Ran tool

好的，现在我为你详细分析 **Common 模块**的功能、关联模块和底层原理。

---

## Common 模块全面解析

### 一、核心定位和作用

**Common（通用模块）** 是低代码引擎的 **工具箱和辅助系统**，它包含了不属于核心模块的通用功能：
1. **Utils 工具集**：Schema 验证、事务管理、国际化、key 转换等
2. **SkeletonCabin**：提供 Workbench 等框架视图组件
3. **DesignerCabin/EditorCabin**（已废弃）：历史遗留 API

---

## 架构层次

```
packages/shell/src/api/common.tsx (对外 API 层)
    ↓
├── Utils (工具类) → packages/utils/src (工具实现)
├── SkeletonCabin → packages/editor-skeleton/src (骨架组件)
└── EditorCabin → packages/editor-core/src (编辑器核心)
```

---

## 一、Utils 工具集详解 ⭐⭐⭐

### 1. **isNodeSchema() - Schema 验证**

**作用**: 判断数据是否为合法的节点 Schema（组件配置数据）。

**底层原理**:
```typescript
// packages/utils/src/check-types/is-node-schema.ts: 4-9
export function isNodeSchema(data: any): data is IPublicTypeNodeSchema {
  if (!isObject(data)) {
    return false; // 不是对象直接返回 false
  }
  // 关键判断：有 componentName 属性 且 不是 Node 实例
  return 'componentName' in data && !data.isNode;
}
```

**关联模块**:
- **Designer.onDragend**: 拖拽结束时验证拖拽数据是否为合法 Schema
- **Document.createNode**: 创建节点前验证 Schema 结构

**使用示例**:
```typescript
// 场景：从物料库拖拽组件到画布
designer.dragon.onDragend((e) => {
  const dragObject = e.dragObject;

  if (isDragNodeDataObject(dragObject)) {
    const nodeData = Array.isArray(dragObject.data)
      ? dragObject.data
      : [dragObject.data];

    // 🔥 验证所有数据是否为合法 Schema
    const isNotNodeSchema = nodeData.find((item) => !isNodeSchema(item));
    if (isNotNodeSchema) {
      return; // 非法数据，停止插入
    }

    // 合法数据，继续插入
    nodes = insertChildren(loc.target, nodeData, loc.detail.index);
  }
});
```

**结果**:
- 合法 Schema：`{ componentName: 'Button', props: { text: '按钮' } }` → `true`
- Node 实例：`node.isNode === true` → `false`
- 普通对象：`{ name: 'test' }` → `false`

---

### 2. **isFormEvent() - 表单事件检测**

**作用**: 判断事件是否来自表单元素（用于快捷键系统）。

**底层原理**:
```typescript
// packages/utils/src/is-form-event.ts: 1-14
export function isFormEvent(e: KeyboardEvent | MouseEvent) {
  const t = e.target as HTMLFormElement;
  if (!t) {
    return false;
  }

  // 检查1: 是否为表单元素或在表单内
  if (t.form || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) {
    return true;
  }

  // 检查2: 是否为可编辑元素（contenteditable）
  if (t instanceof HTMLElement && /write/.test(window.getComputedStyle(t).getPropertyValue('-webkit-user-modify'))) {
    return true;
  }

  return false;
}
```

**关联模块**:
- **快捷键系统**: 在用户输入时禁用快捷键（避免冲突）
- **拖拽系统**: 在表单元素上禁用某些拖拽行为

**使用示例**:
```typescript
// 场景：全局快捷键监听
document.addEventListener('keydown', (e) => {
  // 用户在输入框中打字时，不触发快捷键
  if (isFormEvent(e)) {
    return; // 忽略表单内的快捷键
  }

  // Delete 快捷键：删除选中节点
  if (e.key === 'Delete') {
    project.currentDocument?.selection.remove();
  }
});
```

**结果**:
- 在 `<input>` 中按 Delete → `isFormEvent = true` → 不删除节点，正常删除文字
- 在画布区域按 Delete → `isFormEvent = false` → 删除选中节点

---

### 3. **getNodeSchemaById() - Schema 查询**

**作用**: 从完整的 Schema 树中递归查找指定 ID 的节点。

**底层原理**:
```typescript
// packages/utils/src/schema.ts: 81-99
export function getNodeSchemaById(
  schema: IPublicTypeNodeSchema,
  nodeId: string
): IPublicTypeNodeSchema | undefined {
  let found: IPublicTypeNodeSchema | undefined;

  // 检查当前节点
  if (schema.id === nodeId) {
    return schema;
  }

  const { children, props } = schema;

  // 递归查找 children
  if (Array.isArray(children)) {
    for (const child of children) {
      found = getNodeSchemaById(child as IPublicTypeNodeSchema, nodeId);
      if (found) return found;
    }
  }

  // 递归查找 props 中的 JSSlot（插槽节点）
  if (isPlainObject(props)) {
    found = getNodeSchemaFromPropsById(props, nodeId);
    if (found) return found;
  }
}
```

**关联模块**:
- **Schema 导入**: 从导入的 Schema 中定位特定节点
- **节点关联**: 通过 ID 建立节点间的引用关系

**使用示例**:
```typescript
// 场景：从导入的 Schema 中查找特定节点
const pageSchema = {
  id: 'page',
  componentName: 'Page',
  children: [
    {
      id: 'header',
      componentName: 'Header',
      children: [
        { id: 'logo', componentName: 'Image' }
      ]
    }
  ]
};

// 查找 logo 节点
const logoSchema = common.utils.getNodeSchemaById(pageSchema, 'logo');
console.log(logoSchema);
// => { id: 'logo', componentName: 'Image' }
```

---

### 4. **executeTransaction() - 批处理事务** ⭐⭐⭐

**作用**: 将多个操作包装为一个事务，避免中间状态渲染，优化性能。

**底层原理**:
```typescript
// packages/utils/src/transaction-manager.ts: 5-27
class TransactionManager {
  emitter = new EventEmitter();

  // 执行事务：在开始和结束时发送事件
  executeTransaction = (
    fn: () => void,
    type: IPublicEnumTransitionType = IPublicEnumTransitionType.REPAINT
  ): void => {
    // 1. 发送事务开始事件
    this.emitter.emit(`[${type}]startTransaction`);

    // 2. 在 MobX action 中执行所有操作（批量更新）
    runInAction(fn);

    // 3. 发送事务结束事件
    this.emitter.emit(`[${type}]endTransaction`);
  };

  // 监听事务开始
  onStartTransaction = (fn: () => void, type: ...) => {
    this.emitter.on(`[${type}]startTransaction`, fn);
    // ...
  };

  // 监听事务结束
  onEndTransaction = (fn: () => void, type: ...) => {
    this.emitter.on(`[${type}]endTransaction`, fn);
    // ...
  };
}
```

**关联模块**:
- **模拟器（Simulator）**: 监听事务，暂停/恢复渲染

```typescript
// packages/designer/src/builtin-simulator/host.ts: 639-652
constructor(project: Project, designer: Designer) {
  // 🚫 事务开始：停止自动重绘
  transactionManager.onStartTransaction(() => {
    this.stopAutoRepaintNode(); // 暂停 iframe 渲染
  }, IPublicEnumTransitionType.REPAINT);

  // 防抖渲染优化
  const rerender = debounce(this.rerender.bind(this), 28);

  // ⚡ 事务结束：恢复自动重绘
  transactionManager.onEndTransaction(() => {
    rerender(); // 执行一次完整渲染
    this.enableAutoRepaintNode(); // 恢复自动模式
  }, IPublicEnumTransitionType.REPAINT);
}
```

**使用示例**:
```typescript
import { common } from '@alilc/lowcode-engine';
import { IPublicEnumTransitionType } from '@alilc/lowcode-types';

// ❌ 不使用事务：每次 setProps 都会触发渲染（渲染 3 次）
node1.setProps({ title: '标题1' }); // 渲染 1 次
node2.setProps({ title: '标题2' }); // 渲染 1 次
node3.setProps({ title: '标题3' }); // 渲染 1 次

// ✅ 使用事务：批量操作，只渲染 1 次
common.utils.executeTransaction(() => {
  node1.setProps({ title: '标题1' });
  node2.setProps({ title: '标题2' });
  node3.setProps({ title: '标题3' });
}, IPublicEnumTransitionType.REPAINT);
// 只在事务结束后渲染 1 次，性能提升 3 倍！
```

**结果**:
- 无事务：3 个节点修改 → 3 次渲染 → 用户看到 3 次闪烁
- 有事务：3 个节点修改 → 1 次渲染 → 流畅无闪烁

---

### 5. **getConvertedExtraKey() - Extra Props Key 转换**

**作用**: 将额外属性的 key 转换为内部存储格式（加前后缀）。

**底层原理**:
```typescript
// packages/designer/src/document/node/props/props.ts: 14-27
export const EXTRA_KEY_PREFIX = '___'; // 前后缀标记

// 转换为内部 key：name.type → ___name___type
export function getConvertedExtraKey(key: string): string {
  if (!key) {
    return '';
  }
  let _key = key;
  // 处理点语法：a.b.c → a
  if (key.indexOf('.') > 0) {
    _key = key.split('.')[0];
  }
  // 格式：___前缀部分___.剩余部分
  return EXTRA_KEY_PREFIX + _key + EXTRA_KEY_PREFIX + key.slice(_key.length);
}

// 还原原始 key：___name___type → name.type
export function getOriginalExtraKey(key: string): string {
  return key.replace(new RegExp(`${EXTRA_KEY_PREFIX}`, 'g'), '');
}
```

**关联模块**:
- **Node.setExtraProp**: 设置额外属性时使用
- **Props.export**: 导出 Schema 时将 extra 属性分离出来

**使用示例**:
```typescript
// 场景：存储组件的额外元数据（不属于 props 的信息）
const node = project.currentDocument?.getNode('button1');

// 设置额外属性：设计器的私有数据
node.setExtraProp('hidden', true);       // 内部存储为 ___hidden___
node.setExtraProp('locked', true);       // 内部存储为 ___locked___
node.setExtraProp('loop.data', [1,2,3]); // 内部存储为 ___loop___.data

// 导出 Schema 时，extra 属性会被单独分离
const schema = node.export();
console.log(schema);
// {
//   componentName: 'Button',
//   props: { text: '按钮' },  // 正常属性
//   extras: {                 // 额外属性（单独字段）
//     hidden: true,
//     locked: true,
//     'loop.data': [1,2,3]
//   }
// }
```

**结果**: Extra 属性与 Props 属性隔离存储，避免污染组件的真实属性。

---

### 6. **createIntl() - 国际化工具创建**

**作用**: 为插件创建独立的国际化实例，支持多语言切换。

**底层原理**:
```typescript
// packages/editor-core/src/intl/index.ts: 84-139
export function createIntl(instance: string | object): {
  intlNode(id: string, params?: object): ReactNode;
  intl(id: string, params?: object): string;
  getLocale(): string;
  setLocale(locale: string): void;
} {
  // 1. 根据当前语言加载对应的翻译数据
  const data = (() => {
    const locale = globalLocale.getLocale(); // 获取当前语言：zh-CN/en-US
    if (typeof instance === 'string') {
      // 字符串模式：从 window[instance][locale] 读取
      if ((window as any)[instance]) {
        return (window as any)[instance][locale] || {};
      }
      const key = `${instance}_${locale.toLocaleLowerCase()}`;
      return (window as any)[key] || {};
    }
    if (instance && typeof instance === 'object') {
      // 对象模式：直接从对象中取 locale 对应的数据
      return (instance as any)[locale] || {};
    }
    return {};
  })();

  // 2. 创建翻译函数
  function intl(key: string, params?: object): string {
    const str = data[key]; // 根据 key 获取翻译文本

    if (str == null) {
      return `##intl@${key}##`; // 未找到翻译，显示占位符
    }

    // 使用 intl-messageformat 注入参数
    return injectVars(str, params, globalLocale.getLocale());
  }

  // 3. 创建响应式的 IntlElement 组件
  @observer
  class IntlElement extends Component<{ id: string; params?: object }> {
    render() {
      const { id, params } = this.props;
      return intl(id, params); // 自动响应语言切换
    }
  }

  // 4. 返回国际化 API
  return {
    intlNode(id: string, params?: object) {
      return createElement(IntlElement, { id, params }); // React 组件
    },
    intl, // 纯文本翻译
    getLocale() {
      return globalLocale.getLocale();
    },
    setLocale(locale: string) {
      globalLocale.setLocale(locale); // 切换语言，触发所有 IntlElement 更新
    },
  };
}
```

**关联模块**:
- **全局语言切换**: `globalLocale.setLocale()` 触发所有国际化组件更新
- **插件多语言**: 每个插件可以创建独立的国际化实例

**使用示例**:
```typescript
// zh-CN.json
{
  "title": "属性设置器",
  "save": "保存",
  "cancel": "取消",
  "welcome": "欢迎，{name}！"
}

// en-US.json
{
  "title": "Property Setter",
  "save": "Save",
  "cancel": "Cancel",
  "welcome": "Welcome, {name}!"
}

// 创建国际化实例
import { common } from '@alilc/lowcode-engine';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

const { intl, intlNode, getLocale, setLocale } = common.utils.createIntl({
  'en-US': enUS,
  'zh-CN': zhCN,
});

// 使用翻译
console.log(intl('title'));        // => "属性设置器"
console.log(intl('welcome', { name: '张三' })); // => "欢迎，张三！"

// 切换语言
setLocale('en-US');
console.log(intl('title'));        // => "Property Setter"
console.log(intl('welcome', { name: 'John' })); // => "Welcome, John!"

// React 组件中使用
const MyComponent = () => (
  <div>
    <h1>{intlNode('title')}</h1>  {/* 自动响应语言切换 */}
    <button>{intlNode('save')}</button>
  </div>
);
```

**结果**:
- `setLocale('zh-CN')` → 所有 `intlNode` 组件自动切换为中文
- `setLocale('en-US')` → 所有 `intlNode` 组件自动切换为英文

---

### 7. **intl() - 国际化转换**

**作用**: 将 I18nData 对象转换为当前语言的文本。

**底层原理**:
```typescript
// packages/editor-core/src/intl/index.ts: 32-52
export function intl(data: IPublicTypeI18nData | string, params?: object): ReactNode {
  // 不是 I18nData，直接返回
  if (!isI18nData(data)) {
    return data;
  }

  // 有预设翻译，直接使用
  if (data.intl) {
    return data.intl;
  }

  // 根据当前语言查找翻译
  const locale = globalLocale.getLocale(); // zh-CN
  const tries = generateTryLocales(locale); // ['zh-CN', 'zh_CN', 'en-US', 'en_US']

  let msg: string | undefined;
  for (const lan of tries) {
    msg = data[lan]; // 依次尝试 zh-CN, zh_CN, en-US...
    if (msg != null) {
      break; // 找到翻译，停止查找
    }
  }

  if (msg == null) {
    return `##intl@${locale}##`; // 未找到任何翻译
  }

  return injectVars(msg, params, locale); // 注入参数
}
```

**关联模块**:
- **ComponentMeta.title**: 组件名称的多语言显示
- **Node.title**: 节点标题的国际化

**使用示例**:
```typescript
// 场景：组件元数据的多语言配置
const buttonMeta = {
  componentName: 'Button',
  title: {
    'zh-CN': '按钮',
    'en-US': 'Button',
    'ja-JP': 'ボタン'
  },
  configure: {
    props: [
      {
        name: 'type',
        title: {
          'zh-CN': '按钮类型',
          'en-US': 'Button Type'
        }
      }
    ]
  }
};

// 在编辑器中显示
const displayName = common.utils.intl(buttonMeta.title);
// 当前语言 zh-CN => "按钮"
// 当前语言 en-US => "Button"
// 当前语言 ja-JP => "ボタン"
// 当前语言 fr-FR => "Button" (降级到 en-US)
```

---

## 二、SkeletonCabin 详解

### 1. **Workbench - 编辑器框架视图**

**作用**: 提供编辑器的整体布局框架，是所有区域的容器组件。

**底层原理**:
```typescript
// packages/shell/src/api/common.tsx: 192-195
get Workbench(): any {
  const innerSkeleton = this[skeletonSymbol];
  // 返回一个高阶组件：自动注入 skeleton 实例
  return (props: any) => <InnerWorkbench {...props} skeleton={innerSkeleton} />;
}
```

**Workbench 组件结构**:
```typescript
// packages/editor-skeleton/src/layouts/workbench.tsx: 35-76
@observer
export class Workbench extends Component<{
  skeleton: ISkeleton;
  config?: EditorConfig;
  components?: PluginClassSet;
  className?: string;
  topAreaItemClassName?: string;
}> {
  constructor(props: any) {
    super(props);
    const { config, components, skeleton } = this.props;
    // 🔥 核心：根据配置构建骨架系统
    skeleton.buildFromConfig(config, components);
  }

  render() {
    const { skeleton, className, topAreaItemClassName } = this.props;
    return (
      <div className={classNames('lc-workbench', className)}>
        <SkeletonContext.Provider value={skeleton}>
          {/* 顶部区域：Logo、菜单、全局按钮 */}
          <TopArea area={skeleton.topArea} itemClassName={topAreaItemClassName} />

          <div className="lc-workbench-body">
            {/* 左侧区域：组件库 */}
            <LeftArea area={skeleton.leftArea} />
            {/* 左侧浮动面板：大纲树 */}
            <LeftFloatPane area={skeleton.leftFloatArea} />
            {/* 左侧固定面板 */}
            <LeftFixedPane area={skeleton.leftFixedArea} />

            <div className="lc-workbench-center">
              {/* 工具栏：撤销/重做/缩放 */}
              <Toolbar area={skeleton.toolbar} />
              {/* 🔥 主编辑区：DesignerPlugin 渲染位置 */}
              <MainArea area={skeleton.mainArea} />
              {/* 底部区域：控制台 */}
              <BottomArea area={skeleton.bottomArea} />
            </div>

            {/* 右侧区域：属性面板 */}
            <RightArea area={skeleton.rightArea} />
          </div>

          {/* 全局提示容器 */}
          <TipContainer />
        </SkeletonContext.Provider>
      </div>
    );
  }
}
```

**关联模块**:
- **Skeleton**: 骨架系统，管理所有区域和插件
- **DesignerPlugin**: 主编辑区的核心插件

**使用示例**:
```typescript
import { common } from '@alilc/lowcode-engine';
import ReactDOM from 'react-dom';

// 获取 Workbench 组件
const Workbench = common.skeletonCabin.Workbench;

// 渲染编辑器
ReactDOM.render(
  <Workbench />,
  document.getElementById('app')
);
```

**结果**: 渲染完整的低代码编辑器界面，包含所有区域和插件。

---

## 三、核心流程示例

### 场景：拖拽组件到画布的完整流程

```typescript
// 1. 用户从组件库拖拽 Button 组件
designer.dragon.onDragend((e) => {
  const dragObject = e.dragObject;

  if (isDragNodeDataObject(dragObject)) {
    // 2. 验证 Schema 合法性
    const nodeData = Array.isArray(dragObject.data)
      ? dragObject.data
      : [dragObject.data];

    const isNotNodeSchema = nodeData.find((item) =>
      !common.utils.isNodeSchema(item) // 使用 isNodeSchema 验证
    );

    if (isNotNodeSchema) {
      return; // 非法数据，停止
    }

    // 3. 使用事务批量插入（性能优化）
    let nodes;
    common.utils.executeTransaction(() => {
      // 插入节点
      nodes = insertChildren(loc.target, nodeData, loc.detail.index);

      // 选中新节点
      loc.document?.selection.selectAll(nodes.map((o) => o.id));

      // 聚焦第一个节点
      this.activeTracker.track(nodes![0]);
    }, IPublicEnumTransitionType.REPAINT);
    // 事务结束后，模拟器只渲染 1 次
  }
});
```

---

## 四、总结

### Common 模块的价值

| 功能 | 作用 | 使用场景 |
|------|------|----------|
| `isNodeSchema` | Schema 验证 | 拖拽、导入、创建节点 |
| `isFormEvent` | 表单事件检测 | 快捷键系统、拖拽系统 |
| `getNodeSchemaById` | Schema 查询 | Schema 导入、节点关联 |
| `executeTransaction` | 批处理事务 | 批量操作、性能优化 |
| `getConvertedExtraKey` | Extra Props 转换 | 额外属性存储 |
| `createIntl` | 国际化工具 | 插件多语言 |
| `intl` | 国际化转换 | 组件元数据多语言 |
| `Workbench` | 编辑器框架 | 编辑器渲染 |

### 关键设计理念

1. **性能优化**: `executeTransaction` 通过事务批处理减少渲染次数
2. **数据隔离**: `getConvertedExtraKey` 将 extra 属性与 props 分离
3. **国际化**: `createIntl` 提供响应式的多语言支持
4. **工具集中**: 将通用工具集中到 Common 模块，方便使用

Common 模块虽然不如 Project、Material 等核心模块显眼，但它提供的工具和辅助功能是整个引擎不可或缺的基础设施！