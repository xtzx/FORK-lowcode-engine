# ComponentMeta - 组件元数据模型详解

## 1. 模型概述

`ComponentMeta` 是低代码引擎中定义组件元数据的模型。它包含了组件的所有配置信息，如组件名称、属性定义、嵌套规则、默认值等。ComponentMeta 是组件在设计器中的"说明书"，指导着组件的使用方式和行为规则。

## 2. 核心属性

### 2.1 基础属性

```typescript
class ComponentMeta {
  // 设计器实例
  designer: Designer;

  // 组件名称
  componentName: string;

  // 组件标题
  title?: string | I18nData;

  // 组件描述
  description?: string | I18nData;

  // 组件图标
  icon?: string;

  // 组件分类
  category?: string;

  // 组件标签
  tags?: string[];

  // 是否组件元数据标识
  isComponentMeta: true;
}
```

### 2.2 组件信息

```typescript
{
  // npm 包信息
  npm?: {
    package: string;    // 包名
    version?: string;   // 版本
    exportName?: string; // 导出名称
    subName?: string;   // 子名称
    destructuring?: boolean; // 是否解构导入
  };

  // 组件路径
  componentPath?: string;

  // 是否内置组件
  isBuiltin?: boolean;

  // 是否容器组件
  isContainer?: boolean;

  // 是否模态组件
  isModal?: boolean;

  // 是否根组件
  isRootComponent?: boolean;
}
```

### 2.3 属性定义

```typescript
{
  // 属性配置
  props?: IPublicTypeFieldConfig[];

  // 默认属性值
  defaultProps?: Record<string, any>;

  // 属性转换器
  propsTransducer?: IPublicTypePropsTransducer;

  // 属性白名单
  propsWhitelist?: string[];

  // 属性黑名单
  propsBlacklist?: string[];
}
```

### 2.4 嵌套规则

```typescript
{
  // 父组件白名单
  parentWhitelist?: string[] | ((parent: string) => boolean);

  // 子组件白名单
  childWhitelist?: string[] | ((child: string) => boolean);

  // 祖先组件黑名单
  ancestorBlacklist?: string[];

  // 后代组件黑名单
  descendantBlacklist?: string[];
}
```

### 2.5 高级配置

```typescript
{
  // 配置信息
  configure?: IPublicTypeComponentConfigure;

  // 可用动作
  availableActions?: IPublicTypeComponentAction[];

  // 高级功能
  advanced?: {
    // 回调函数
    callbacks?: {
      onMoveHook?: (node: Node) => boolean;
      onChildMoveHook?: (child: Node, parent: Node) => boolean;
      onHoverHook?: (node: Node) => void;
      onClickHook?: (node: Node) => void;
    };

    // 自定义渲染
    customRender?: (node: Node) => ReactElement;

    // 条件配置
    condition?: (node: Node) => boolean;
  };
}
```

## 3. 核心方法

### 3.1 基础操作

```typescript
// 获取元数据
getMetadata(): IPublicTypeComponentMetadata;

// 设置元数据
setMetadata(metadata: IPublicTypeComponentMetadata): void;

// 刷新元数据
refreshMetadata(): void;

// 验证元数据
validate(): boolean;

// 获取默认属性
getDefaultProps(): Record<string, any>;
```

### 3.2 嵌套规则检查

```typescript
// 检查是否可以嵌套（向下）
checkNestingDown(target: Node | ComponentMeta | string): boolean;

// 检查是否可以嵌套（向上）
checkNestingUp(parent: Node | ComponentMeta | string): boolean;

// 检查祖先约束
checkAncestor(ancestor: Node): boolean;

// 检查后代约束
checkDescendant(descendant: Node): boolean;

// 获取可嵌套的子组件
getChildrenComponentMetas(): ComponentMeta[];

// 获取可作为的父组件
getParentComponentMetas(): ComponentMeta[];
```

### 3.3 属性处理

```typescript
// 转换属性
transformProps(props: any): any;

// 获取属性配置
getPropConfig(name: string): IPublicTypeFieldConfig | null;

// 验证属性值
validatePropValue(name: string, value: any): boolean;

// 获取属性默认值
getPropDefaultValue(name: string): any;

// 过滤属性
filterProps(props: Record<string, any>): Record<string, any>;
```

### 3.4 动作管理

```typescript
// 获取可用动作
getAvailableActions(): IPublicTypeComponentAction[];

// 执行动作
executeAction(name: string, node: Node): void;

// 检查动作是否可用
isActionAvailable(name: string, node: Node): boolean;

// 注册动作
registerAction(action: IPublicTypeComponentAction): void;
```

### 3.5 事件相关

```typescript
// 监听元数据变化
onMetadataChange(fn: () => void): IPublicTypeDisposable;

// 触发元数据变化
emitMetadataChange(): void;
```

## 4. 核心原理

### 4.1 元数据结构

```typescript
interface IPublicTypeComponentMetadata {
  // 基础信息
  componentName: string;
  title?: string | I18nData;
  description?: string | I18nData;
  docUrl?: string;
  screenshot?: string;
  icon?: string;
  tags?: string[];
  category?: string;

  // npm信息
  npm?: IPublicTypeNpmInfo;

  // 配置信息
  configure?: IPublicTypeComponentConfigure;

  // 属性信息
  props?: IPublicTypeFieldConfig[];

  // 嵌套规则
  nestingRule?: IPublicTypeNestingRule;

  // 高级配置
  advanced?: IPublicTypeAdvanced;
}
```

### 4.2 属性配置系统

```typescript
// 属性配置结构
interface IPublicTypeFieldConfig {
  // 属性名
  name: string;

  // 显示标题
  title?: string | I18nData;

  // 描述
  description?: string | I18nData;

  // 默认值
  defaultValue?: any;

  // 是否必填
  required?: boolean;

  // 属性类型
  type?: string;

  // 设置器
  setter?: IPublicTypeSetterConfig;

  // 验证规则
  validate?: (value: any) => boolean | string;

  // 条件显示
  condition?: (target: Node) => boolean;
}
```

### 4.3 嵌套规则实现

```typescript
// 嵌套检查算法
checkNestingDown(target: Node | string): boolean {
  const targetName = typeof target === 'string' ? target : target.componentName;

  // 检查白名单
  if (this.childWhitelist) {
    if (Array.isArray(this.childWhitelist)) {
      return this.childWhitelist.includes(targetName);
    }
    return this.childWhitelist(targetName);
  }

  // 检查黑名单
  if (this.descendantBlacklist) {
    return !this.descendantBlacklist.includes(targetName);
  }

  // 默认允许
  return true;
}
```

### 4.4 属性转换机制

```typescript
// 属性转换器
transformProps(props: any): any {
  if (!this.propsTransducer) return props;

  // 执行转换
  const transformed = this.propsTransducer(props, this);

  // 应用白名单
  if (this.propsWhitelist) {
    const filtered: any = {};
    this.propsWhitelist.forEach(key => {
      if (key in transformed) {
        filtered[key] = transformed[key];
      }
    });
    return filtered;
  }

  // 应用黑名单
  if (this.propsBlacklist) {
    const filtered = { ...transformed };
    this.propsBlacklist.forEach(key => {
      delete filtered[key];
    });
    return filtered;
  }

  return transformed;
}
```

## 5. 元数据配置

### 5.1 基础组件配置

```typescript
// Button 组件元数据示例
const buttonMeta: IPublicTypeComponentMetadata = {
  componentName: 'Button',
  title: '按钮',
  description: '基础按钮组件',
  icon: 'https://img.alicdn.com/tfs/button.svg',
  category: '基础组件',
  tags: ['表单', '交互'],

  props: [
    {
      name: 'text',
      title: '文本',
      setter: 'StringSetter',
      defaultValue: '按钮'
    },
    {
      name: 'type',
      title: '类型',
      setter: {
        componentName: 'SelectSetter',
        props: {
          options: [
            { label: '主要', value: 'primary' },
            { label: '次要', value: 'secondary' },
            { label: '危险', value: 'danger' }
          ]
        }
      },
      defaultValue: 'primary'
    },
    {
      name: 'disabled',
      title: '禁用',
      setter: 'BoolSetter',
      defaultValue: false
    }
  ]
};
```

### 5.2 容器组件配置

```typescript
// 容器组件元数据
const containerMeta: IPublicTypeComponentMetadata = {
  componentName: 'Container',
  title: '容器',

  configure: {
    component: {
      isContainer: true,
      nestingRule: {
        // 子组件白名单
        childWhitelist: ['Button', 'Text', 'Image'],

        // 父组件白名单
        parentWhitelist: (parent) => parent !== 'Button'
      }
    },

    advanced: {
      callbacks: {
        // 子组件移动钩子
        onChildMoveHook: (child, parent) => {
          // 检查业务规则
          if (child.componentName === 'Modal') {
            return false; // 不允许Modal移入
          }
          return true;
        }
      }
    }
  }
};
```

### 5.3 高级组件配置

```typescript
// 表单组件元数据
const formMeta: IPublicTypeComponentMetadata = {
  componentName: 'Form',
  title: '表单',

  configure: {
    props: [
      {
        name: 'model',
        title: '数据模型',
        setter: 'ObjectSetter',
        supportVariable: true
      },
      {
        name: 'rules',
        title: '验证规则',
        setter: 'JsonSetter'
      }
    ],

    component: {
      isContainer: true,

      // 属性转换器
      propsTransducer: (props) => {
        // 转换数据结构
        if (props.model && typeof props.model === 'string') {
          props.model = { value: props.model };
        }
        return props;
      }
    },

    advanced: {
      // 自定义渲染
      customRender: (node) => {
        // 特殊渲染逻辑
        return <FormWrapper {...node.props} />;
      }
    }
  }
};
```

## 6. 与其他模型的关系

### 6.1 与 Node 的关系
- Node 通过 componentName 关联 ComponentMeta
- ComponentMeta 提供 Node 的行为规则
- Node 创建时使用 ComponentMeta 的默认值

### 6.2 与 Designer 的关系
- Designer 管理所有 ComponentMeta
- 通过 Designer.componentMetaMap 访问
- Designer 负责注册和更新 ComponentMeta

### 6.3 与 Props 的关系
- ComponentMeta 定义属性结构
- Props 根据 ComponentMeta 验证属性
- 属性设置器由 ComponentMeta 定义

## 7. 使用方式

### 7.1 注册组件元数据

```typescript
// 注册单个组件
designer.registerComponentMeta({
  componentName: 'MyComponent',
  title: '我的组件',
  props: [...]
});

// 批量注册
designer.registerComponentMetas([
  buttonMeta,
  containerMeta,
  formMeta
]);
```

### 7.2 获取组件元数据

```typescript
// 通过组件名获取
const meta = designer.getComponentMeta('Button');

// 通过节点获取
const nodeMeta = node.componentMeta;

// 获取所有元数据
const allMetas = designer.componentMetaMap;
```

### 7.3 使用元数据

```typescript
// 创建组件时使用默认值
const defaultProps = meta.getDefaultProps();
const node = document.createNode({
  componentName: meta.componentName,
  props: { ...defaultProps, ...customProps }
});

// 检查嵌套规则
if (parentMeta.checkNestingDown(childMeta)) {
  parentNode.appendChild(childNode);
}

// 执行组件动作
const actions = meta.getAvailableActions();
actions.forEach(action => {
  if (meta.isActionAvailable(action.name, node)) {
    // 显示动作按钮
  }
});
```

## 8. 高级特性

### 8.1 动态元数据

```typescript
// 动态生成元数据
class DynamicComponentMeta extends ComponentMeta {
  getMetadata() {
    const base = super.getMetadata();

    // 根据条件动态修改
    if (this.designer.getMode() === 'mobile') {
      base.props = this.getMobileProps();
    }

    return base;
  }

  private getMobileProps() {
    // 返回移动端专用属性配置
    return [...];
  }
}
```

### 8.2 元数据继承

```typescript
// 元数据继承机制
function extendComponentMeta(
  base: IPublicTypeComponentMetadata,
  extension: Partial<IPublicTypeComponentMetadata>
): IPublicTypeComponentMetadata {
  return {
    ...base,
    ...extension,
    props: [
      ...(base.props || []),
      ...(extension.props || [])
    ],
    configure: {
      ...base.configure,
      ...extension.configure
    }
  };
}

// 使用继承
const customButtonMeta = extendComponentMeta(buttonMeta, {
  componentName: 'CustomButton',
  title: '自定义按钮',
  props: [
    {
      name: 'customProp',
      title: '自定义属性',
      setter: 'StringSetter'
    }
  ]
});
```

### 8.3 元数据验证

```typescript
// 元数据验证器
class MetadataValidator {
  validate(metadata: IPublicTypeComponentMetadata): ValidationResult {
    const errors: string[] = [];

    // 必填字段检查
    if (!metadata.componentName) {
      errors.push('componentName is required');
    }

    // 属性配置检查
    metadata.props?.forEach((prop, index) => {
      if (!prop.name) {
        errors.push(`props[${index}].name is required`);
      }
      if (prop.setter && typeof prop.setter === 'object') {
        if (!prop.setter.componentName) {
          errors.push(`props[${index}].setter.componentName is required`);
        }
      }
    });

    // 嵌套规则检查
    if (metadata.configure?.component?.nestingRule) {
      // 验证嵌套规则的合法性
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## 9. 注意事项

### 9.1 性能考虑
- 避免在元数据中存储大对象
- 使用懒加载加载组件资源
- 缓存元数据查询结果

### 9.2 兼容性
- 确保元数据版本兼容
- 处理旧版本元数据迁移
- 提供默认值避免崩溃

### 9.3 扩展性
- 使用标准化的元数据格式
- 预留扩展字段
- 支持插件扩展元数据

## 10. 最佳实践

### 10.1 元数据组织

```typescript
// 按类别组织元数据
const componentRegistry = {
  basic: {
    Button: buttonMeta,
    Text: textMeta,
    Image: imageMeta
  },

  layout: {
    Container: containerMeta,
    Grid: gridMeta,
    Flex: flexMeta
  },

  form: {
    Form: formMeta,
    Input: inputMeta,
    Select: selectMeta
  }
};

// 统一注册
Object.values(componentRegistry).forEach(category => {
  designer.registerComponentMetas(Object.values(category));
});
```

### 10.2 类型安全

```typescript
// 使用TypeScript定义元数据
interface ButtonProps {
  text: string;
  type: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
}

const typedButtonMeta: IPublicTypeComponentMetadata<ButtonProps> = {
  componentName: 'Button',
  props: [
    {
      name: 'text',
      type: 'string',
      required: true
    }
    // TypeScript会检查属性定义
  ]
};
```

### 10.3 元数据测试

```typescript
// 元数据单元测试
describe('ButtonMeta', () => {
  let meta: ComponentMeta;

  beforeEach(() => {
    meta = new ComponentMeta(designer, buttonMeta);
  });

  test('should have correct default props', () => {
    const defaults = meta.getDefaultProps();
    expect(defaults.text).toBe('按钮');
    expect(defaults.type).toBe('primary');
  });

  test('should validate nesting rules', () => {
    expect(meta.checkNestingUp('Container')).toBe(true);
    expect(meta.checkNestingUp('Button')).toBe(false);
  });

  test('should transform props correctly', () => {
    const transformed = meta.transformProps({
      text: 'Click',
      extra: 'value'
    });
    expect(transformed.extra).toBeUndefined();
  });
});
```
