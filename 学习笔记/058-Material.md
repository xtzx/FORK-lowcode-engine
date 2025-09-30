我来为你详细分析 **Material 模块**的功能、关联模块和底层原理。
Ran tool

Ran tool

Ran tool

Ran tool

Ran tool

Ran tool

好的，现在我为你详细分析 **Material 模块**的功能、关联模块和底层原理。

---

## Material 模块全面解析

### 一、核心定位和作用

**Material（物料管理器）** 是低代码引擎的 **组件资产管理中心**，负责管理所有可用的组件、组件元数据、设计器辅助功能等。它是引擎的"物料库"，所有的组件配置、设计器交互按钮、右键菜单等都由它管理。

**核心职责**：
1. **管理资产包（Assets）**：组件库、依赖包、样式等
2. **管理组件元数据（ComponentMeta）**：组件的属性配置、setter、snippet 等
3. **设计器辅助层**：画布上的交互按钮（删除、复制、隐藏等）
4. **右键菜单**：节点的上下文菜单
5. **元数据转换管道**：统一处理组件元数据

---

## 架构层次

```
packages/shell/src/api/material.ts (对外 API 层)
    ↓
packages/designer/src/designer/designer.ts (核心实现层)
    ↓
ComponentMeta (组件元数据) / ComponentActions (组件动作)
    ↓
Simulator (模拟器加载组件资源)
```

---

## 核心变量详解

### 1. **componentsMap - 组件映射表**

**作用**: 获取所有已加载组件的映射关系（组件名 → 组件实现）。

**底层原理**:
```typescript
// packages/shell/src/api/material.ts: 57-59
get componentsMap(): { [key: string]: IPublicTypeNpmInfo | ComponentType<any> | object } {
  return this[designerSymbol].componentsMap;
}

// packages/designer/src/designer/designer.ts
get componentsMap() {
  return this.project?.simulator?.componentsMap || {};
}
```

**数据结构**:
```javascript
{
  'Button': Button组件类,
  'Input': Input组件类,
  'CustomComponent': CustomComponent组件类
}
```

**使用示例**:
```javascript
const { material } = window.AliLowCodeEngine;

// 获取组件映射表
const componentsMap = material.componentsMap;

// 检查某个组件是否已加载
if (componentsMap['Button']) {
  console.log('Button 组件已加载');
}

// 遍历所有组件
Object.keys(componentsMap).forEach(name => {
  console.log(`组件: ${name}`, componentsMap[name]);
});
```

---

## 核心方法详解

### 一、资产包管理

### 1. **setAssets() - 设置资产包** ⭐⭐⭐

**作用**: 这是最核心的方法，用于加载整个组件库的资产包（组件元数据、依赖包、样式等）。

**底层原理**:

```typescript
// packages/shell/src/api/material.ts: 66-68
async setAssets(assets: IPublicTypeAssetsJson) {
  return await this[editorSymbol].setAssets(assets);
}

// packages/editor-core/src/editor.ts
async setAssets(assets: IPublicTypeAssetsJson) {
  // 1. 保存 assets 到 editor
  await this.set('assets', assets);

  // 2. 提取组件元数据，构建 ComponentMeta
  designer.buildComponentMetasMap(assets.components);

  // 3. 加载依赖包到 simulator
  await simulator.setupComponents(assets.packages);
}
```

**Assets 数据结构**:
```javascript
{
  version: '1.0.0',
  packages: [  // 依赖包
    {
      package: '@alifd/next',
      version: '1.25.0',
      library: 'Next',
      urls: [
        '//unpkg.com/@alifd/next@1.25.0/dist/next.min.js',
        '//unpkg.com/@alifd/next@1.25.0/dist/next.min.css'
      ]
    }
  ],
  components: [  // 组件元数据
    {
      componentName: 'Button',
      title: '按钮',
      props: [
        {
          name: 'type',
          propType: { type: 'oneOf', value: ['primary', 'secondary'] },
          defaultValue: 'primary',
          title: '类型'
        },
        {
          name: 'size',
          propType: 'string',
          defaultValue: 'medium',
          title: '尺寸'
        }
      ],
      configure: {
        component: {
          isContainer: false
        },
        props: [
          {
            name: 'type',
            setter: {
              componentName: 'SelectSetter',
              props: {
                options: [
                  { label: '主要', value: 'primary' },
                  { label: '次要', value: 'secondary' }
                ]
              }
            }
          }
        ]
      },
      snippets: [
        {
          title: '按钮',
          schema: {
            componentName: 'Button',
            props: {
              type: 'primary',
              children: '按钮'
            }
          }
        }
      ]
    }
  ],
  componentList: [  // 组件分类（用于组件面板展示）
    {
      title: '基础组件',
      icon: '',
      children: [
        {
          componentName: 'Button',
          title: '按钮'
        },
        {
          componentName: 'Input',
          title: '输入框'
        }
      ]
    }
  ]
}
```

**加载流程**:
```
setAssets(assets)
    ↓
1. 构建 ComponentMeta
   designer.buildComponentMetasMap(assets.components)
    ↓
   遍历每个组件元数据
    ↓
   new ComponentMeta(componentMetadata)
    ↓
   应用元数据转换器
    ↓
   存储到 designer.componentMetasMap

    ↓
2. 加载依赖包到 iframe
   simulator.setupComponents(assets.packages)
    ↓
   解析 packages 的 urls
    ↓
   生成 <script> 和 <link> 标签
    ↓
   注入到 iframe 的 HTML
    ↓
   等待资源加载完成
    ↓
   组件库在 iframe 中可用
```

**使用示例**:

**场景1：直接加载资产包**
```javascript
import { material } from '@alilc/lowcode-engine';
import assets from './assets.json';

// 加载资产包
await material.setAssets(assets);

// 结果：
// 1. Button、Input 等组件的元数据已注册
// 2. @alifd/next 包已加载到 iframe
// 3. 组件面板显示所有组件
// 4. 可以从组件面板拖拽组件到画布
```

**场景2：动态加载资产包**
```javascript
import { material, plugins } from '@alilc/lowcode-engine';

plugins.register((ctx) => {
  return {
    name: 'ext-assets',
    async init() {
      // 从服务器获取资产包
      const res = await fetch('https://example.com/assets.json');
      const assets = await res.json();

      // 加载资产包
      await material.setAssets(assets);

      console.log('资产包加载完成');
    }
  };
});
```

---

### 2. **getAssets() - 获取资产包**

**作用**: 获取当前已加载的资产包数据。

**使用示例**:
```javascript
const assets = material.getAssets();
console.log('当前组件数量:', assets.components.length);
console.log('依赖包:', assets.packages);
```

---

### 3. **loadIncrementalAssets() - 加载增量资产包** ⭐

**作用**: 增量加载新的组件，不会覆盖已有的，而是合并。

**底层原理**:
```typescript
// packages/designer/src/designer/designer.ts: 632-650
async loadIncrementalAssets(incrementalAssets: IPublicTypeAssetsJson): Promise<void> {
  const { components, packages } = incrementalAssets;

  // 1. 构建新组件的元数据
  components && this.buildComponentMetasMap(components);

  // 2. 加载新的依赖包到 simulator
  if (packages) {
    await this.project.simulator?.setupComponents(packages);
  }

  // 3. 合并 assets
  if (components) {
    let assets = this.editor.get('assets') || {};
    let newAssets = mergeAssets(assets, incrementalAssets);
    await this.editor.set('assets', newAssets);
  }

  // 4. 刷新组件映射表（触发 simulator 重新构建组件）
  this.refreshComponentMetasMap();

  // 5. 发出事件
  this.editor.eventBus.emit('designer.incrementalAssetsReady');
}
```

**合并策略**:
- **components**: 按 `componentName` 合并，相同名称的组件后者覆盖前者
- **packages**: 按 `package` 名称合并，相同的包后者覆盖前者
- **componentList**: 直接追加

**使用示例**:

**场景1：初始加载 + 增量加载**
```javascript
// 初始加载基础组件
await material.setAssets(baseAssets);

// 增量加载业务组件
await material.loadIncrementalAssets({
  version: '1.0.0',
  packages: [
    {
      package: '@my/business-components',
      version: '1.0.0',
      library: 'BizComponents',
      urls: [
        '//cdn.example.com/biz-components.js',
        '//cdn.example.com/biz-components.css'
      ]
    }
  ],
  components: [
    {
      componentName: 'ProductCard',
      title: '商品卡片',
      props: [...]
    }
  ]
});

// 结果：
// - 保留了基础组件（Button、Input 等）
// - 新增了业务组件（ProductCard）
// - 两者可以同时使用
```

**场景2：更新某个组件的元数据**
```javascript
// 原来的 Button 配置
{
  componentName: 'Button',
  props: [
    { name: 'type', title: '类型' }
  ]
}

// 更新 Button 的配置（新增 size 属性）
await material.loadIncrementalAssets({
  version: '',
  components: [
    {
      componentName: 'Button',
      props: [
        { name: 'type', title: '类型' },
        { name: 'size', title: '尺寸', propType: 'string' }  // 新增
      ]
    }
  ]
});

// 结果：
// - Button 的元数据被更新
// - 属性面板会显示新的 size 配置项
```

**场景3：动态加载自定义组件**
```javascript
// 用户从组件市场选择了一个图表组件
const chartAssets = {
  packages: [
    { package: 'echarts', version: '5.0.0', library: 'echarts', urls: [...] }
  ],
  components: [
    {
      componentName: 'Chart',
      title: '图表',
      props: [
        { name: 'type', title: '图表类型' },
        { name: 'data', title: '数据' }
      ]
    }
  ]
};

await material.loadIncrementalAssets(chartAssets);

// 结果：
// - 组件面板新增了 Chart 组件
// - 可以拖拽 Chart 到画布
```

---

### 二、设计器辅助层

### 4. **addBuiltinComponentAction() - 添加辅助按钮** ⭐

**作用**: 在画布上选中组件时，在组件周围添加自定义的操作按钮。

**什么是设计器辅助层**:
- 当你在画布中选中一个组件时，组件周围会出现一些小图标
- 这些图标就是"辅助层"（Component Action）
- 内置的有：删除、复制、隐藏、锁定等

![](https://img.alicdn.com/imgextra/i4/O1CN01jDbN7B1KfWVzJ16tw_!!6000000001191-2-tps-230-198.png)

**底层原理**:
```typescript
// packages/designer/src/component-actions.ts: 24-36
actions: IPublicTypeComponentAction[] = [
  {
    name: 'remove',
    content: {
      icon: IconRemove,
      title: '删除',
      action(node: IPublicModelNode) {
        node.remove();  // 删除节点
      }
    },
    important: true,  // 重要按钮，始终显示
  },
  {
    name: 'copy',
    content: {
      icon: IconClone,
      title: '复制',
      action(node: IPublicModelNode) {
        node.copy();  // 复制节点
      }
    }
  },
  // ... 其他内置 action
]
```

**使用示例**:

**场景1：添加"预览"按钮**
```javascript
import { material } from '@alilc/lowcode-engine';

material.addBuiltinComponentAction({
  name: 'preview',
  content: {
    icon: () => '👁',  // 或使用 React 组件
    title: '预览组件',
    action(node) {
      console.log('预览组件:', node.componentName);
      // 打开预览弹窗
      openPreviewDialog(node.exportSchema());
    }
  },
  important: true,  // 重要按钮，始终显示
  condition: true,  // 显示条件，true 表示始终显示
});

// 结果：
// - 选中任何组件时，都会在辅助层显示"预览"按钮
// - 点击按钮会执行 action 函数
```

**场景2：只为特定组件添加按钮**
```javascript
material.addBuiltinComponentAction({
  name: 'editTable',
  content: {
    icon: () => '✏️',
    title: '编辑表格',
    action(node) {
      // 打开表格编辑器
      openTableEditor(node);
    }
  },
  condition: (node) => {
    // 只在 Table 组件上显示
    return node.componentName === 'Table';
  }
});

// 结果：
// - 只有选中 Table 组件时，才会显示"编辑表格"按钮
// - 其他组件不显示
```

**场景3：添加带状态的按钮**
```javascript
material.addBuiltinComponentAction({
  name: 'toggleLock',
  content: {
    icon: (node) => {
      // 根据节点状态显示不同图标
      return node.getPropValue('locked') ? '🔒' : '🔓';
    },
    title: (node) => {
      return node.getPropValue('locked') ? '解锁' : '锁定';
    },
    action(node) {
      const locked = node.getPropValue('locked');
      node.setPropValue('locked', !locked);
    }
  }
});

// 结果：
// - 按钮图标和文字会随节点状态变化
// - 点击切换锁定状态
```

---

### 5. **removeBuiltinComponentAction() - 移除辅助按钮**

**作用**: 移除指定的辅助按钮（包括内置的）。

**内置按钮名称**:
- `remove`: 删除
- `hide`: 隐藏
- `copy`: 复制
- `lock`: 锁定
- `unlock`: 解锁

**使用示例**:
```javascript
// 移除删除按钮（防止误删）
material.removeBuiltinComponentAction('remove');

// 移除自定义按钮
material.removeBuiltinComponentAction('preview');
```

---

### 6. **modifyBuiltinComponentAction() - 修改辅助按钮** ⭐

**作用**: 修改已有按钮的行为（包括内置的）。

**使用示例**:

**场景1：在删除前添加确认**
```javascript
material.modifyBuiltinComponentAction('remove', (action) => {
  const originalAction = action.content.action;

  action.content.action = (node) => {
    // 添加确认对话框
    if (confirm(`确定要删除 ${node.componentName} 吗？`)) {
      originalAction(node);  // 执行原删除逻辑
      console.log('组件已删除');
    }
  };
});

// 结果：
// - 点击删除按钮时会弹出确认对话框
// - 确认后才执行删除
```

**场景2：添加日志记录**
```javascript
material.modifyBuiltinComponentAction('copy', (action) => {
  const originalAction = action.content.action;

  action.content.action = (node) => {
    console.log('复制前:', node.id);
    originalAction(node);
    console.log('复制后:', node.id);

    // 上报统计
    analytics.track('component_copy', {
      componentName: node.componentName
    });
  };
});
```

**场景3：禁用某个按钮**
```javascript
material.modifyBuiltinComponentAction('remove', (action) => {
  action.condition = (node) => {
    // 禁止删除 Page 组件
    return node.componentName !== 'Page';
  };
});

// 结果：
// - Page 组件不显示删除按钮
// - 其他组件正常显示
```

---

### 三、右键菜单

### 7. **addContextMenuOption() - 添加右键菜单项** ⭐

**作用**: 在画布中右键点击节点时，添加自定义菜单项。

**使用示例**:

**场景1：添加单个菜单项**
```javascript
import { material } from '@alilc/lowcode-engine';

material.addContextMenuOption({
  name: 'duplicateMultiple',
  title: '批量复制',
  condition: (nodes) => {
    // 只在选中一个或多个节点时显示
    return nodes.length > 0;
  },
  action: (nodes) => {
    const times = prompt('复制几次？', '3');
    nodes.forEach(node => {
      for (let i = 0; i < parseInt(times); i++) {
        node.replicate();
      }
    });
  }
});

// 结果：
// - 右键菜单中新增"批量复制"选项
// - 点击后弹出输入框，输入复制次数
// - 自动复制指定次数
```

**场景2：添加带子菜单的菜单项**
```javascript
import { IPublicEnumContextMenuType } from '@alilc/lowcode-types';

material.addContextMenuOption({
  name: 'alignMenu',
  title: '对齐',
  condition: (nodes) => nodes.length > 1,  // 多选时显示
  items: [
    {
      name: 'alignLeft',
      title: '左对齐',
      action: (nodes) => {
        // 实现左对齐逻辑
        const minLeft = Math.min(...nodes.map(n => n.rect.left));
        nodes.forEach(n => {
          n.setPropValue('style.left', minLeft + 'px');
        });
      }
    },
    {
      name: 'alignCenter',
      title: '居中对齐',
      action: (nodes) => {
        // 实现居中对齐逻辑
      }
    },
    {
      // 分割线
      type: IPublicEnumContextMenuType.SEPARATOR,
      name: 'separator.1'
    },
    {
      name: 'alignTop',
      title: '顶部对齐',
      action: (nodes) => {
        // 实现顶部对齐逻辑
      }
    }
  ]
});

// 结果：
// - 右键菜单中新增"对齐"选项
// - 鼠标悬停显示子菜单
// - 包含：左对齐、居中对齐、分割线、顶部对齐
```

**场景3：根据节点类型显示不同菜单**
```javascript
material.addContextMenuOption({
  name: 'editTableData',
  title: '编辑表格数据',
  condition: (nodes) => {
    // 只在选中 Table 组件时显示
    return nodes.length === 1 && nodes[0].componentName === 'Table';
  },
  action: (nodes) => {
    const table = nodes[0];
    openTableDataEditor(table.getPropValue('dataSource'));
  }
});
```

---

### 8. **removeContextMenuOption() - 移除右键菜单项**

**使用示例**:
```javascript
// 移除自定义菜单项
material.removeContextMenuOption('duplicateMultiple');

// 移除内置菜单项（如果有的话）
material.removeContextMenuOption('copy');
```

---

### 9. **adjustContextMenuLayout() - 调整菜单布局** ⭐

**作用**: 全局调整右键菜单的布局和顺序。

**使用示例**:

**场景1：添加分割线**
```javascript
material.adjustContextMenuLayout((actions) => {
  const newActions = [];

  actions.forEach((action, index) => {
    newActions.push(action);

    // 在特定菜单项后添加分割线
    if (['copy', 'delete'].includes(action.name)) {
      newActions.push({
        type: 'separator',
        name: `separator-${index}`
      });
    }
  });

  return newActions;
});

// 结果：
// - 复制菜单项后有分割线
// - 删除菜单项后有分割线
```

**场景2：调整菜单项顺序**
```javascript
material.adjustContextMenuLayout((actions) => {
  // 定义优先级顺序
  const order = ['copy', 'paste', 'delete', 'lock'];

  return actions.sort((a, b) => {
    const aIndex = order.indexOf(a.name);
    const bIndex = order.indexOf(b.name);

    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;

    return aIndex - bIndex;
  });
});

// 结果：
// - 菜单项按 copy → paste → delete → lock 顺序显示
// - 未在 order 中的菜单项排在最后
```

**场景3：分组显示**
```javascript
material.adjustContextMenuLayout((actions) => {
  const groups = {
    edit: ['copy', 'paste', 'delete'],
    layout: ['alignLeft', 'alignCenter', 'alignRight'],
    other: []
  };

  const result = [];

  // 编辑组
  result.push(...actions.filter(a => groups.edit.includes(a.name)));
  result.push({ type: 'separator', name: 'sep1' });

  // 布局组
  result.push(...actions.filter(a => groups.layout.includes(a.name)));
  result.push({ type: 'separator', name: 'sep2' });

  // 其他
  result.push(...actions.filter(a =>
    !groups.edit.includes(a.name) &&
    !groups.layout.includes(a.name)
  ));

  return result;
});

// 结果：
// - 菜单项按功能分组
// - 组之间有分割线
```

---

### 四、物料元数据

### 10. **getComponentMeta() - 获取组件元数据**

**作用**: 获取指定组件的元数据（配置信息）。

**ComponentMeta 包含什么**:
- 组件名称、标题、图标
- 属性列表及类型
- Setter 配置
- Snippet（拖拽模板）
- 是否容器组件
- 等等

**使用示例**:
```javascript
const buttonMeta = material.getComponentMeta('Button');

console.log(buttonMeta.componentName);  // 'Button'
console.log(buttonMeta.title);          // '按钮'
console.log(buttonMeta.isContainer);    // false

// 获取属性配置
const typeProp = buttonMeta.getProp('type');
console.log(typeProp.name);             // 'type'
console.log(typeProp.title);            // '类型'
console.log(typeProp.setter);           // Setter 配置

// 获取所有 Snippet
const snippets = buttonMeta.snippets;
snippets.forEach(snippet => {
  console.log(snippet.title);           // 'primary 按钮'
  console.log(snippet.schema);          // 组件 schema
});
```

---

### 11. **getComponentMetasMap() - 获取所有元数据**

**使用示例**:
```javascript
const metasMap = material.getComponentMetasMap();

// 遍历所有组件
metasMap.forEach((meta, componentName) => {
  console.log(`${componentName}: ${meta.title}`);
});

// 检查某个组件是否存在
if (metasMap.has('CustomComponent')) {
  console.log('CustomComponent 已注册');
}
```

---

### 12. **refreshComponentMetasMap() - 刷新元数据映射**

**作用**: 触发模拟器重新构建组件（当组件元数据变化后需要调用）。

**使用场景**:
```javascript
// 修改了组件元数据后
await material.loadIncrementalAssets(newAssets);

// 刷新映射，让 iframe 中的组件重新构建
material.refreshComponentMetasMap();
```

---

### 五、元数据转换管道

### 13. **registerMetadataTransducer() - 注册元数据转换器** ⭐⭐⭐

**作用**: 这是一个非常强大的功能，允许在组件元数据初始化时对其进行统一处理。

**什么是元数据转换器**:
- 类似于 `propsTransducer`（属性转换器），但作用于组件元数据
- 在 ComponentMeta 创建时自动应用
- 可以添加、删除、修改组件的配置

**底层原理**:
```typescript
// packages/designer/src/component-meta.ts: 289-305
private transformMetadata(metadata: IPublicTypeComponentMetadata): IPublicTypeTransformedComponentMetadata {
  // 获取所有已注册的转换器
  const registeredTransducers = this.designer.componentActions.getRegisteredMetadataTransducers();

  // 依次应用转换器
  const result = registeredTransducers.reduce((prevMetadata, current) => {
    return current(prevMetadata);  // 每个转换器接收前一个的结果
  }, preprocessMetadata(metadata));

  return result;
}
```

**转换器执行时机**:
```
setAssets(assets)
    ↓
buildComponentMetasMap(components)
    ↓
遍历每个组件
    ↓
new ComponentMeta(metadata)
    ↓
transformMetadata(metadata)
    ↓
应用所有注册的转换器（按 level 排序）
    ↓
ComponentMeta 创建完成
```

**使用示例**:

**场景1：为所有组件添加"是否渲染"配置** ⭐
```javascript
import { material } from '@alilc/lowcode-engine';

function addConditionConfig(metadata) {
  const { componentName, configure = {} } = metadata;

  // 创建高级配置组
  const advancedGroup = {
    name: '#advanced',
    title: { type: 'i18n', 'zh-CN': '高级', 'en-US': 'Advanced' },
    items: [
      {
        name: '___condition___',  // 特殊属性名
        title: { type: 'i18n', 'zh-CN': '是否渲染', 'en-US': 'Condition' },
        defaultValue: true,
        setter: [
          { componentName: 'BoolSetter' },
          { componentName: 'VariableSetter' }
        ],
        extraProps: {
          display: 'block'
        }
      }
    ]
  };

  // 添加到配置中
  const combined = configure.combined || [];
  combined.push(advancedGroup);

  return {
    ...metadata,
    configure: {
      ...configure,
      combined
    }
  };
}

// 注册转换器（level=1，优先级较高）
material.registerMetadataTransducer(addConditionConfig, 1, 'add-condition');

// 结果：
// - 所有组件的属性面板都会有"高级"tab
// - "高级"tab 中有"是否渲染"配置项
// - 可以控制组件的显示/隐藏
```

**场景2：删除某些配置项**
```javascript
material.registerMetadataTransducer((metadata) => {
  const { configure = {} } = metadata;
  const combined = configure.combined || [];

  // 删除"高级"tab
  const newCombined = combined.filter(group => group.name !== '#advanced');

  return {
    ...metadata,
    configure: {
      ...configure,
      combined: newCombined
    }
  };
}, 111, 'remove-advanced');

// 结果：
// - 所有组件都没有"高级"tab
```

**场景3：统一修改 Setter**
```javascript
material.registerMetadataTransducer((metadata) => {
  const { configure = {} } = metadata;
  const props = configure.props || [];

  // 将所有 StringSetter 替换为 TextAreaSetter
  props.forEach(prop => {
    if (prop.setter === 'StringSetter') {
      prop.setter = 'TextAreaSetter';
    }
  });

  return {
    ...metadata,
    configure: {
      ...configure,
      props
    }
  };
}, 50, 'replace-setter');

// 结果：
// - 所有字符串输入框变成文本域
```

**场景4：为特定组件添加特殊配置**
```javascript
material.registerMetadataTransducer((metadata) => {
  // 只处理 Table 组件
  if (metadata.componentName !== 'Table') {
    return metadata;
  }

  const { configure = {} } = metadata;
  const props = configure.props || [];

  // 添加"编辑数据"按钮
  props.push({
    name: '__editData__',
    title: '编辑数据',
    setter: {
      componentName: 'ButtonSetter',
      props: {
        text: '编辑表格数据',
        onClick: (target) => {
          openTableEditor(target.node.getPropValue('dataSource'));
        }
      }
    }
  });

  return {
    ...metadata,
    configure: {
      ...configure,
      props
    }
  };
}, 10, 'table-edit-data');

// 结果：
// - Table 组件的属性面板有"编辑数据"按钮
// - 点击打开表格编辑器
```

**多个转换器的执行顺序**:
```javascript
// level 越小越先执行
material.registerMetadataTransducer(transducer1, 1);   // 第一个执行
material.registerMetadataTransducer(transducer2, 50);  // 第二个执行
material.registerMetadataTransducer(transducer3, 100); // 第三个执行

// metadata 经过处理链：
// 原始 metadata → transducer1 → transducer2 → transducer3 → 最终 metadata
```

---

### 14. **getRegisteredMetadataTransducers() - 获取所有转换器**

**使用示例**:
```javascript
const transducers = material.getRegisteredMetadataTransducers();
console.log('已注册的转换器数量:', transducers.length);

transducers.forEach(t => {
  console.log(`${t.id}: level=${t.level}`);
});
```

---

## 事件系统

### 1. **onChangeAssets() - 监听资产包变化**

**触发时机**:
- 调用 `setAssets()`
- 调用 `loadIncrementalAssets()`

**使用示例**:
```javascript
material.onChangeAssets(() => {
  console.log('资产包已更新');

  // 刷新组件面板
  refreshComponentPanel();

  // 记录日志
  console.log('当前组件数量:', material.getAssets().components.length);
});
```

---

## 完整使用流程示例

### 场景1：构建一个完整的组件库系统

```javascript
import { material } from '@alilc/lowcode-engine';

// 1. 加载基础组件库
await material.setAssets({
  version: '1.0.0',
  packages: [
    {
      package: '@alifd/next',
      version: '1.25.0',
      library: 'Next',
      urls: [
        '//unpkg.com/@alifd/next@1.25.0/dist/next.min.js',
        '//unpkg.com/@alifd/next@1.25.0/dist/next.min.css'
      ]
    }
  ],
  components: [
    {
      componentName: 'Button',
      title: '按钮',
      props: [...]
    },
    {
      componentName: 'Input',
      title: '输入框',
      props: [...]
    }
  ]
});

// 2. 注册元数据转换器（统一添加"是否渲染"配置）
material.registerMetadataTransducer((metadata) => {
  // 添加高级配置...
}, 1);

// 3. 添加设计器辅助按钮
material.addBuiltinComponentAction({
  name: 'preview',
  content: {
    icon: () => '👁',
    title: '预览',
    action: (node) => {
      openPreview(node.exportSchema());
    }
  },
  important: true
});

// 4. 添加右键菜单
material.addContextMenuOption({
  name: 'duplicateMultiple',
  title: '批量复制',
  action: (nodes) => {
    const times = prompt('复制几次？');
    nodes.forEach(n => {
      for (let i = 0; i < parseInt(times); i++) {
        n.replicate();
      }
    });
  }
});

// 5. 监听资产包变化
material.onChangeAssets(() => {
  console.log('组件库已更新');
});

// 6. 动态加载业务组件
await material.loadIncrementalAssets({
  components: [
    {
      componentName: 'ProductCard',
      title: '商品卡片',
      props: [...]
    }
  ]
});
```

---

## 总结

**Material 模块**是低代码引擎的**组件资产管理中心**，它：

1. **管理组件库资产**（setAssets、loadIncrementalAssets）
2. **管理组件元数据**（ComponentMeta）
3. **提供设计器辅助功能**（辅助按钮、右键菜单）
4. **支持元数据转换管道**（统一处理组件配置）
5. **与模拟器集成**（加载组件到 iframe）

Material 是连接组件库和设计器的桥梁，所有的组件配置、交互功能都通过它来管理和扩展。