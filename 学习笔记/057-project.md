我来为你详细分析 Project 模块的功能、关联模块和底层原理。
Ran tool

Ran tool

Ran tool

Ran tool

Ran tool

Ran tool

Ran tool

好的，现在我为你详细分析 **Project 模块**的功能、关联模块和底层原理。

---

## Project 模块全面解析

### 一、核心定位和作用

**Project（项目管理器）** 是低代码引擎的 **数据管理中心**，负责管理整个项目的所有数据和文档。它是引擎的"大脑"，所有的页面（Document）、组件数据、多语言配置等都由它统一管理。

**核心职责**：
1. **管理多个 Document**（页面/组件）
2. **项目数据的导入导出**（Schema 管理）
3. **模拟器生命周期管理**
4. **多语言和配置管理**
5. **属性转换管道**（PropsTransducer）

---

## 架构层次

```
packages/shell/src/api/project.ts (对外 API 层)
    ↓
packages/designer/src/project/project.ts (核心实现层)
    ↓
packages/designer/src/document/document-model.ts (文档管理层)
    ↓
Node → Props → Prop (节点数据层)
```

---

## 核心变量详解

### 1. **currentDocument - 当前文档**

**作用**: 获取当前激活的文档（页面/组件）。

**底层原理**:
```typescript
// packages/designer/src/project/project.ts: 116-118
@computed get currentDocument(): IDocumentModel | null | undefined {
  return this.documents.find((doc) => doc.active);
}
```

- 使用 MobX `@computed` 计算属性
- 从 `documents` 数组中查找 `active` 为 true 的文档
- 同一时间只有一个文档是激活状态

**使用示例**:
```javascript
const { project } = window.AliLowCodeEngine;

// 获取当前文档
const doc = project.currentDocument;
console.log(doc.fileName);  // 'page1'

// 获取当前文档的根节点
const rootNode = doc.root;
console.log(rootNode.componentName);  // 'Page'
```

**关联模块**:
- `DocumentModel`: 文档模型，管理单个页面的节点树
- `Node`: 节点模型，文档中的每个组件都是一个节点

---

### 2. **documents - 所有文档列表**

**作用**: 获取项目下的所有文档（多页面应用会有多个文档）。

**底层原理**:
```typescript
// packages/designer/src/project/project.ts: 96
@obx.shallow readonly documents: IDocumentModel[] = [];
```

- 使用 MobX `@obx.shallow` 使数组响应式
- `shallow` 表示只观察数组本身的变化（增删），不观察数组内元素的深层变化
- 数组元素的变化由各 DocumentModel 自己管理

**使用示例**:
```javascript
// 获取所有文档
const docs = project.documents;
console.log(docs.length);  // 3

// 遍历所有文档
docs.forEach(doc => {
  console.log(doc.fileName, doc.id);
});

// 结果：
// page1 doc_xxx1
// page2 doc_xxx2
// component1 doc_xxx3
```

**应用场景**:
- **多页面应用**: 一个项目包含多个页面（首页、详情页、列表页等）
- **组件库**: 一个项目包含多个可复用组件
- **页面切换**: 通过切换 active 状态来切换不同页面的编辑

---

### 3. **simulatorHost - 模拟器主机**

**作用**: 获取模拟器实例，控制画布的渲染和交互。

**底层原理**:
```typescript
// packages/designer/src/project/project.ts: 112-114
get simulator(): ISimulatorHost | null {
  return this._simulator || null;
}
```

**什么是 Simulator**:
- **Simulator（模拟器）** 是一个 **iframe**，在其中渲染低代码页面
- 设计器和 Simulator 通过 **postMessage** 通信
- Simulator 负责真实的组件渲染，设计器负责拖拽、选中等交互

**使用示例**:
```javascript
// 获取模拟器
const simulator = project.simulatorHost;

// 重新渲染画布
simulator.rerender();

// 获取画布中的 document 对象
const doc = simulator.contentDocument;

// 滚动画布到指定位置
simulator.scrollTo(0, 100);
```

**关联模块**:
- `BuiltinSimulatorHost`: 内置模拟器实现
- `Renderer`: 在 iframe 中运行的渲染器

---

## 核心方法详解

### 1. **createDocument() - 创建文档**

**作用**: 创建一个新的文档（页面/组件）。

**底层原理**:
```typescript
// packages/designer/src/project/project.ts: 305-310
@action
createDocument(data?: IPublicTypeRootSchema): IDocumentModel {
  const doc = new DocumentModel(this, data || this?.data?.componentsTree?.[0]);
  this.documents.push(doc);
  this.documentsMap.set(doc.id, doc);
  return doc;
}
```

**流程**:
1. 创建 `DocumentModel` 实例（传入 schema 数据）
2. 添加到 `documents` 数组
3. 添加到 `documentsMap` Map 对象（用于快速查找）

**使用示例**:
```javascript
// 创建一个空白页面
const doc = project.createDocument();

// 创建一个带初始数据的页面
const doc = project.createDocument({
  componentName: 'Page',
  fileName: 'HomePage',
  children: [
    {
      componentName: 'Div',
      props: {
        style: { width: '100%', height: '100px' }
      }
    }
  ]
});

console.log(doc.fileName);  // 'HomePage'
console.log(doc.root.children.length);  // 1
```

**应用场景**:
- **新建页面**: 用户点击"新建页面"按钮
- **复制页面**: 复制现有页面创建新页面
- **导入页面**: 从外部导入页面模板

---

### 2. **openDocument() - 打开文档**

**作用**: 打开（激活）一个文档，使其成为当前编辑的文档。

**底层原理**:
```typescript
// packages/designer/src/project/project.ts: 312-347
open(doc?: string | IDocumentModel | IPublicTypeRootSchema): IDocumentModel | null {
  if (!doc) {
    // 1. 无参数：打开空白页或创建新页面
    const got = this.documents.find((item) => item.isBlank());
    if (got) {
      return got.open();
    }
    doc = this.createDocument();
    return doc.open();
  }

  if (typeof doc === 'string' || typeof doc === 'number') {
    // 2. 字符串：按 fileName 或 id 查找
    const got = this.documents.find((item) =>
      item.fileName === String(doc) || String(item.id) === String(doc)
    );
    if (got) {
      return got.open();
    }

    // 从 schema 中查找
    const data = this.data.componentsTree.find((data) =>
      data.fileName === String(doc)
    );
    if (data) {
      doc = this.createDocument(data);
      return doc.open();
    }

    return null;
  } else if (isDocumentModel(doc)) {
    // 3. DocumentModel 实例：直接打开
    return doc.open();
  }

  // 4. Schema 对象：创建新文档并打开
  doc = this.createDocument(doc);
  return doc.open();
}
```

**调用 `doc.open()` 会做什么**:
```typescript
// packages/designer/src/document/document-model.ts
open(): this {
  this.project.checkExclusive(this);  // 关闭其他文档
  this._active = true;                // 设置为激活状态
  this.designer.postEvent('document.change', this);  // 发出事件
  return this;
}
```

**使用示例**:
```javascript
// 场景1：打开空白页
project.openDocument();

// 场景2：按文件名打开
project.openDocument('HomePage');

// 场景3：按 ID 打开
project.openDocument('doc_abc123');

// 场景4：打开已有文档实例
const doc = project.documents[1];
project.openDocument(doc);

// 场景5：用 schema 创建并打开
project.openDocument({
  componentName: 'Page',
  fileName: 'NewPage',
  children: []
});
```

**关联模块**:
- `DocumentModel.open()`: 文档的打开逻辑
- `project.checkExclusive()`: 确保只有一个文档激活

---

### 3. **removeDocument() - 删除文档**

**作用**: 从项目中删除一个文档。

**底层原理**:
```typescript
// packages/designer/src/project/project.ts: 255-262
removeDocument(doc: IDocumentModel) {
  const index = this.documents.indexOf(doc);
  if (index < 0) {
    return;
  }
  this.documents.splice(index, 1);
  this.documentsMap.delete(doc.id);
}
```

**使用示例**:
```javascript
const doc = project.getDocumentByFileName('OldPage');
project.removeDocument(doc);

// 结果：OldPage 从项目中删除
```

**触发事件**:
```javascript
project.onRemoveDocument(({ id }) => {
  console.log(`文档 ${id} 被删除了`);
});
```

---

### 4. **getDocumentById() / getDocumentByFileName() - 获取文档**

**作用**: 按 ID 或文件名查找文档。

**使用示例**:
```javascript
// 按 ID 查找
const doc1 = project.getDocumentById('doc_abc123');

// 按文件名查找
const doc2 = project.getDocumentByFileName('HomePage');
```

---

### 5. **exportSchema() - 导出项目数据**

**作用**: 导出整个项目的 Schema 数据，用于保存、预览、发布等。

**底层原理**:
```typescript
// packages/designer/src/project/project.ts: 179-190
getSchema(stage: IPublicEnumTransformStage = IPublicEnumTransformStage.Save): IPublicTypeProjectSchema {
  return {
    ...this.data,
    componentsMap: this.getComponentsMap(),  // 所有用到的组件
    componentsTree: this.documents
      .filter((doc) => !doc.isBlank())       // 过滤空白文档
      .map((doc) => doc.export(stage) || {} as IPublicTypeRootSchema),  // 导出每个文档
    i18n: this.i18n,                         // 多语言数据
  };
}
```

**TransformStage（转换阶段）**:
- `Save`: 保存阶段（保存到数据库）
- `Render`: 渲染阶段（在 iframe 中渲染）
- `Serilize`: 序列化阶段（通用导出）
- `Clone`: 克隆阶段（复制节点）

不同阶段的 schema 会有差异：
- `Save`: 完整数据，包含 ID
- `Render`: 渲染需要的数据，添加 docId
- `Clone`: 复制数据，不包含 ID

**使用示例**:
```javascript
// 保存时导出
const saveSchema = project.exportSchema(TransformStage.Save);
await saveToDatabase(saveSchema);

// 预览时导出
const renderSchema = project.exportSchema(TransformStage.Render);
sendToIframe(renderSchema);

// 输出示例：
{
  version: '1.0.0',
  componentsMap: [
    { componentName: 'Button', package: '@alifd/next' },
    { componentName: 'Input', package: '@alifd/next' }
  ],
  componentsTree: [
    {
      componentName: 'Page',
      fileName: 'HomePage',
      children: [...]
    },
    {
      componentName: 'Page',
      fileName: 'DetailPage',
      children: [...]
    }
  ],
  i18n: {
    'zh-CN': { title: '首页' },
    'en-US': { title: 'Home' }
  }
}
```

**关联模块**:
- `DocumentModel.export()`: 导出单个文档
- `Node.export()`: 导出单个节点
- `Props.export()`: 导出属性

**导出流程**:
```
project.exportSchema()
    ↓
遍历 documents
    ↓
doc.export(stage)
    ↓
rootNode.export(stage)
    ↓
遍历 children
    ↓
child.export(stage)
    ↓
props.export(stage)
    ↓
应用 propsTransducer（属性转换器）
```

---

### 6. **importSchema() - 导入项目数据**

**作用**: 导入项目 Schema，加载整个项目数据。

**底层原理**:
```typescript
// packages/shell/src/api/project.ts: 149-151
importSchema(schema?: IPublicTypeProjectSchema): void {
  this[projectSymbol].load(schema, true);  // true 表示自动打开第一个文档
}

// packages/designer/src/project/project.ts: 208-241
@action
load(schema?: IPublicTypeProjectSchema, autoOpen?: boolean | string) {
  this.unload();  // 先卸载现有数据

  // 加载新数据
  this.data = {
    version: '1.0.0',
    componentsMap: [],
    componentsTree: [],
    i18n: {},
    ...schema,
  };
  this.config = schema?.config || this.config;
  this.i18n = schema?.i18n || this.i18n;

  if (autoOpen) {
    if (autoOpen === true) {
      // 创建所有文档实例
      const documentInstances = this.data.componentsTree.map((data) =>
        this.createDocument(data)
      );
      // 打开第一个文档
      documentInstances[0].open();
    } else {
      // 打开指定文件名的文档
      this.open(autoOpen);
    }
  }
}
```

**使用示例**:
```javascript
// 从服务器加载项目
const schema = await fetchProjectFromServer();
project.importSchema(schema);

// 结果：
// 1. 清空现有数据
// 2. 加载新的页面和组件
// 3. 自动打开第一个页面
// 4. 画布渲染新的内容
```

**应用场景**:
- **加载项目**: 打开一个已保存的项目
- **切换项目**: 从项目 A 切换到项目 B
- **导入模板**: 导入一个项目模板

---

### 7. **addPropsTransducer() - 添加属性转换器** ⭐

**作用**: 这是一个非常强大的功能，允许在特定阶段对所有组件的属性进行统一处理。

**底层原理**:
```typescript
// packages/shell/src/api/project.ts: 166-171
addPropsTransducer(transducer: IPublicTypePropsTransducer, stage: IPublicEnumTransformStage): void {
  this[projectSymbol].designer.addPropsReducer(transducer, stage);
}

// packages/designer/src/designer/designer.ts: 871-884
addPropsReducer(reducer: IPublicTypePropsTransducer, stage: IPublicEnumTransformStage) {
  const reducers = this.propsReducers.get(stage);
  if (reducers) {
    reducers.push(reducer);
  } else {
    this.propsReducers.set(stage, [reducer]);
  }
}
```

**转换器的调用时机**:
```typescript
// packages/designer/src/designer/designer.ts: 835-863
transformProps(props, node, stage) {
  const reducers = this.propsReducers.get(stage);
  if (!reducers || reducers.length < 1) {
    return props;
  }

  // 依次应用所有转换器
  return reducers.reduce((xprops, reducer) => {
    try {
      return reducer(xprops, node, { stage });
    } catch (e) {
      logger.error('transducer execute error:', e);
      return xprops;
    }
  }, props);
}
```

**在 Node 导出时调用**:
```typescript
// packages/designer/src/document/node/node.ts: 985-986
const schema: any = {
  ...baseSchema,
  props: this.document.designer.transformProps(props, this, stage),  // 🔥 这里调用
  ...this.document.designer.transformProps(_extras_, this, stage),
};
```

**使用示例**:

**场景1：保存时删除 hidden 属性**
```javascript
import { TransformStage } from '@alilc/lowcode-types';

// 删除所有组件的 hidden 属性（保存时不需要）
project.addPropsTransducer((props, node, ctx) => {
  delete props.hidden;
  return props;
}, TransformStage.Save);

// 结果：
// 保存时，所有组件的 props.hidden 会被删除
// 但编辑时仍然保留（只影响 Save 阶段）
```

**场景2：渲染时添加默认样式**
```javascript
// 为所有 Button 添加默认样式
project.addPropsTransducer((props, node, ctx) => {
  if (node.componentName === 'Button') {
    return {
      ...props,
      style: {
        borderRadius: '4px',
        ...props.style
      }
    };
  }
  return props;
}, TransformStage.Render);

// 结果：画布中所有 Button 都会有圆角边框
```

**场景3：保存时加密敏感数据**
```javascript
// 保存时加密 API 密钥
project.addPropsTransducer((props, node, ctx) => {
  if (props.apiKey) {
    return {
      ...props,
      apiKey: encrypt(props.apiKey)  // 加密
    };
  }
  return props;
}, TransformStage.Save);
```

**场景4：统一处理国际化**
```javascript
// 保存时将文本转换为国际化 key
project.addPropsTransducer((props, node, ctx) => {
  if (props.text && typeof props.text === 'string') {
    const i18nKey = generateI18nKey(props.text);
    addToI18nDict(i18nKey, props.text);
    return {
      ...props,
      text: {
        type: 'i18n',
        key: i18nKey
      }
    };
  }
  return props;
}, TransformStage.Save);
```

**多个转换器的执行顺序**:
```javascript
// 按注册顺序依次执行
project.addPropsTransducer(transducer1, TransformStage.Save);  // 第一个执行
project.addPropsTransducer(transducer2, TransformStage.Save);  // 第二个执行
project.addPropsTransducer(transducer3, TransformStage.Save);  // 第三个执行

// props 经过处理链：
// props -> transducer1 -> transducer2 -> transducer3 -> 最终 props
```

---

### 8. **setI18n() - 设置多语言**

**作用**: 设置项目的多语言数据。

**使用示例**:
```javascript
project.setI18n({
  'zh-CN': {
    'home.title': '首页',
    'home.welcome': '欢迎使用'
  },
  'en-US': {
    'home.title': 'Home',
    'home.welcome': 'Welcome'
  }
});

// 在组件中使用
{
  componentName: 'Text',
  props: {
    content: {
      type: 'i18n',
      key: 'home.title'
    }
  }
}
```

---

### 9. **setConfig() - 设置项目配置**

**作用**: 设置项目的自定义配置。

**使用示例**:
```javascript
// 设置整个配置
project.setConfig({
  theme: 'dark',
  layout: {
    type: 'tabs',
    items: [...]
  }
});

// 设置单个配置
project.setConfig('theme', 'dark');

// 获取配置
const theme = project.config.theme;
```

---

## 事件系统详解

### 1. **onChangeDocument() - 文档切换事件**

**触发时机**: 当前文档切换时（用户切换页面）。

**底层原理**:
```typescript
// packages/designer/src/project/project.ts: 349-356
checkExclusive(activeDoc: DocumentModel) {
  this.documents.forEach((doc) => {
    if (doc !== activeDoc) {
      doc.suspense();  // 暂停其他文档
    }
  });
  this.emitter.emit('current-document.change', activeDoc);  // 发出事件
}
```

**使用示例**:
```javascript
project.onChangeDocument((doc) => {
  console.log(`切换到文档: ${doc.fileName}`);

  // 更新 UI
  updateTabBar(doc.fileName);

  // 加载文档相关数据
  loadDocumentData(doc.id);
});
```

**应用场景**:
- **标签页切换**: 更新顶部标签页的激活状态
- **侧边栏更新**: 切换文档时更新大纲树
- **数据加载**: 加载新文档的资源和配置

---

### 2. **onRemoveDocument() - 文档删除事件**

**使用示例**:
```javascript
project.onRemoveDocument(({ id }) => {
  console.log(`文档 ${id} 被删除`);

  // 关闭对应的标签页
  closeTab(id);

  // 清理缓存
  clearCache(id);
});
```

---

### 3. **onSimulatorHostReady() - 模拟器就绪事件**

**触发时机**: 模拟器（iframe）加载完成并准备好渲染。

**底层原理**:
```typescript
// packages/designer/src/project/project.ts: 366-370
mountSimulator(simulator: ISimulatorHost) {
  this._simulator = simulator;
  this.emitter.emit('lowcode_engine_simulator_ready', simulator);
}
```

**使用示例**:
```javascript
project.onSimulatorHostReady((simulator) => {
  console.log('模拟器已就绪');

  // 可以安全地操作模拟器了
  simulator.rerender();

  // 注入自定义脚本到 iframe
  const iframeWindow = simulator.contentWindow;
  iframeWindow.customAPI = {...};
});
```

**应用场景**:
- **首次加载**: 确保模拟器准备好后再渲染内容
- **注入脚本**: 向 iframe 注入全局变量或方法
- **性能监控**: 记录模拟器加载时间

---

### 4. **onSimulatorRendererReady() - 渲染器就绪事件**

**触发时机**: 渲染器在 iframe 中启动完成。

**区别**:
- `onSimulatorHostReady`: **iframe 加载完成**（空白 iframe）
- `onSimulatorRendererReady`: **React 渲染器启动完成**（可以渲染组件了）

**使用示例**:
```javascript
project.onSimulatorRendererReady(() => {
  console.log('渲染器已就绪，可以渲染组件了');

  // 开始渲染页面
  project.simulatorHost.rerender();
});
```

---

## 完整使用流程示例

### 场景1：创建一个多页面应用

```javascript
import { project, TransformStage } from '@alilc/lowcode-engine';

// 1. 创建首页
const homePage = project.createDocument({
  componentName: 'Page',
  fileName: 'HomePage',
  children: [
    {
      componentName: 'Div',
      props: {
        className: 'header',
        children: '首页'
      }
    }
  ]
});

// 2. 创建详情页
const detailPage = project.createDocument({
  componentName: 'Page',
  fileName: 'DetailPage',
  children: [
    {
      componentName: 'Div',
      props: {
        className: 'detail',
        children: '详情页'
      }
    }
  ]
});

// 3. 打开首页进行编辑
project.openDocument('HomePage');

// 4. 监听页面切换
project.onChangeDocument((doc) => {
  console.log(`当前编辑: ${doc.fileName}`);
});

// 5. 切换到详情页
project.openDocument('DetailPage');

// 6. 导出项目（保存）
const schema = project.exportSchema(TransformStage.Save);
await saveToServer(schema);
```

---

### 场景2：加载已有项目并进行编辑

```javascript
// 1. 从服务器加载项目
const savedSchema = await fetchFromServer();

// 2. 导入项目
project.importSchema(savedSchema);

// 3. 获取当前文档
const doc = project.currentDocument;

// 4. 编辑文档
doc.root.children.forEach(child => {
  if (child.componentName === 'Button') {
    child.setPropValue('type', 'primary');
  }
});

// 5. 保存修改
const newSchema = project.exportSchema(TransformStage.Save);
await saveToServer(newSchema);
```

---

### 场景3：使用属性转换器进行数据处理

```javascript
// 注册转换器：保存时删除调试属性
project.addPropsTransducer((props, node, ctx) => {
  // 删除开发时的调试属性
  delete props.__debug;
  delete props.__temp;

  // 清理空样式
  if (props.style && Object.keys(props.style).length === 0) {
    delete props.style;
  }

  return props;
}, TransformStage.Save);

// 导出时会自动应用转换器
const cleanSchema = project.exportSchema(TransformStage.Save);
// 结果：所有组件的 __debug、__temp 属性都被删除了
```

---

## 与其他模块的关联

### 1. **与 DocumentModel 的关系**

Project 是 DocumentModel 的容器：
```
Project (1)
    ↓ has many
DocumentModel (N)
```

- Project 管理多个 Document
- 每个 Document 代表一个页面或组件
- 同一时间只有一个 Document 是激活状态

---

### 2. **与 Simulator 的关系**

```
Project
    ↓ mountSimulator()
SimulatorHost
    ↓ renders
iframe (画布)
    ↓ contains
ReactRenderer
    ↓ renders
Low-code Components
```

- Project 负责挂载 Simulator
- Simulator 负责在 iframe 中渲染
- 通过 postMessage 通信

---

### 3. **与 Designer 的关系**

```
Designer
    ↓ contains
Project
    ↓ manages
Documents
```

- Designer 是总控制器
- Project 是数据管理器
- Designer 通过 Project 访问数据

---

### 4. **与 Schema 的关系**

```
ProjectSchema {
  version,
  componentsMap,     // 用到的组件列表
  componentsTree,    // 所有文档的 schema
  i18n               // 多语言
}

RootSchema {
  componentName,
  fileName,
  children           // 节点树
}
```

---

## 总结

**Project 模块**是低代码引擎的**数据管理中心**，它：

1. **管理多个 Document**（页面/组件）
2. **负责数据的导入导出**（Schema 管理）
3. **提供属性转换管道**（PropsTransducer）
4. **管理模拟器生命周期**
5. **支持多语言和自定义配置**
6. **提供完整的事件系统**

所有的页面数据、组件配置、多语言资源都由 Project 统一管理，它是连接引擎和业务数据的桥梁。