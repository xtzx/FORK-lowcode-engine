# Prop - 属性模型详解

## 1. 模型概述

`Prop` 是低代码引擎中表示节点单个属性的模型。它管理着属性的值、类型、嵌套结构等，支持各种复杂的属性类型，包括基础类型、表达式、插槽等。Prop 是构成节点属性系统的基本单元。

## 2. 核心属性

### 2.1 基础属性

```typescript
class Prop {
  // 属性ID
  id: string;

  // 父级（Props或Prop）
  parent: Props | Prop;

  // 属性名
  key: string;

  // 属性类型
  type: 'prop' | 'slots' | 'literal' | 'expression' | 'slot';

  // 是否为spread属性
  spread: boolean = false;

  // 是否为属性实例标识
  isProp: true;
}
```

### 2.2 值相关属性

```typescript
{
  // 属性值
  _value: any;

  // 计算后的值
  value: any;

  // 是否设置值
  isUnset: boolean;

  // 插槽节点（当type为slot时）
  _slotNode?: SlotNode;

  // 代码值（当type为expression时）
  code: string;
}
```

### 2.3 嵌套属性

```typescript
{
  // 嵌套属性集合
  _items?: Prop[];

  // 属性映射
  _maps?: Map<string, Prop>;

  // 属性路径
  path: string[];

  // 嵌套深度
  depth: number;
}
```

## 3. 核心方法

### 3.1 值操作

```typescript
// 获取值
getValue(): any;

// 设置值
setValue(value: any): void;

// 获取代码（表达式）
getCode(): string;

// 设置代码
setCode(code: string): void;

// 重置值
unset(): void;

// 判断是否设置
isSetted(): boolean;
```

### 3.2 类型操作

```typescript
// 设置为字面量
setAsLiteral(value: any): void;

// 设置为表达式
setAsExpression(expression: string | JSExpression): void;

// 设置为插槽
setAsSlot(slot: JSSlot): void;

// 设置为事件处理器
setAsEventHandler(handler: JSFunction): void;

// 获取值类型
getValueType(): string;
```

### 3.3 嵌套属性操作

```typescript
// 获取嵌套属性
get(path: string | string[]): Prop | null;

// 设置嵌套属性
set(path: string | string[], value: any): Prop;

// 判断是否有嵌套属性
has(path: string): boolean;

// 添加嵌套属性
add(key: string, value: any): Prop;

// 删除嵌套属性
delete(path: string): void;

// 获取所有子属性
items(): Prop[];

// 遍历子属性
forEach(fn: (prop: Prop, key: string) => void): void;
```

### 3.4 导入导出

```typescript
// 导入值
import(value: any): void;

// 导出值
export(stage?: IPublicEnumTransformStage): any;

// 转换为数据
toData(): any;

// 克隆属性
clone(): Prop;
```

### 3.5 比较与验证

```typescript
// 比较值
compare(value: any): boolean;

// 验证值
validate(): boolean;

// 获取默认值
getDefaultValue(): any;

// 是否为必需属性
isRequired(): boolean;
```

## 4. 核心原理

### 4.1 属性类型系统

```typescript
// 类型判断链
Prop.create(value) {
  if (isJSExpression(value)) return new ExpressionProp(value);
  if (isJSSlot(value)) return new SlotProp(value);
  if (isJSFunction(value)) return new FunctionProp(value);
  if (isPlainObject(value)) return new ObjectProp(value);
  return new LiteralProp(value);
}
```

### 4.2 值管理机制

```typescript
// 值的存储和计算
class Prop {
  // 原始值
  private _value: any;

  // 计算属性
  @computed get value() {
    if (this.type === 'expression') {
      return this.evaluate(this._value);
    }
    return this._value;
  }

  // 设置值
  @action setValue(value: any) {
    this._value = value;
    this.notifyChange();
  }
}
```

### 4.3 嵌套结构管理

```typescript
// 路径解析
resolvePath(path: string): string[] {
  return path.split('.').filter(Boolean);
}

// 递归查找
findProp(path: string[]): Prop | null {
  if (path.length === 0) return this;
  const [key, ...rest] = path;
  const child = this._maps?.get(key);
  return child ? child.findProp(rest) : null;
}
```

### 4.4 响应式更新

```typescript
// 属性变更通知
@action notifyChange() {
  // 通知父级
  this.parent?.onPropChange(this);

  // 触发节点更新
  this.getNode()?.emitPropChange({
    prop: this,
    oldValue: this._oldValue,
    newValue: this.value
  });
}
```

## 5. 属性类型详解

### 5.1 字面量属性（Literal）

```typescript
// 基础类型值
prop.setValue('text');
prop.setValue(123);
prop.setValue(true);
prop.setValue(['item1', 'item2']);
```

### 5.2 表达式属性（Expression）

```typescript
// JSExpression
prop.setAsExpression({
  type: 'JSExpression',
  value: 'this.state.count + 1'
});

// 简写形式
prop.setAsExpression('this.props.visible && this.state.loaded');
```

### 5.3 函数属性（Function）

```typescript
// JSFunction
prop.setValue({
  type: 'JSFunction',
  value: `function onClick(e) {
    console.log('clicked', e);
    this.setState({ clicked: true });
  }`
});
```

### 5.4 插槽属性（Slot）

```typescript
// JSSlot
prop.setAsSlot({
  type: 'JSSlot',
  value: [
    {
      componentName: 'Button',
      props: { text: '按钮' }
    }
  ],
  params: ['item', 'index']
});
```

### 5.5 对象属性（Object）

```typescript
// 嵌套对象
prop.setValue({
  style: {
    color: '#ff0000',
    fontSize: 14,
    margin: {
      top: 10,
      bottom: 10
    }
  }
});

// 访问嵌套属性
const color = prop.get('style.color');
const marginTop = prop.get('style.margin.top');
```

## 6. 与其他模型的关系

### 6.1 与 Props 的关系
- Prop 是 Props 集合中的元素
- Props 管理多个 Prop 实例
- 通过 parent 引用所属的 Props

### 6.2 与 Node 的关系
- Prop 属于某个 Node 的属性
- 通过 `getNode()` 获取所属节点
- 属性变更会触发节点更新

### 6.3 与 SettingField 的关系
- SettingField 提供属性的编辑器
- Prop 存储实际的属性值
- 通过 setter 进行值的编辑

## 7. 使用方式

### 7.1 基础操作

```typescript
// 获取属性
const prop = node.props.getProp('title');

// 设置值
prop.setValue('新标题');

// 获取值
const value = prop.getValue();

// 重置属性
prop.unset();
```

### 7.2 类型转换

```typescript
// 字面量转表达式
prop.setAsExpression('this.state.title');

// 表达式转字面量
prop.setAsLiteral('固定标题');

// 设置为函数
prop.setAsEventHandler({
  type: 'JSFunction',
  value: 'function() { alert("clicked"); }'
});
```

### 7.3 嵌套属性操作

```typescript
// 获取嵌套属性
const styleProp = node.props.getProp('style');
const colorProp = styleProp.get('color');

// 设置嵌套属性
styleProp.set('backgroundColor', '#f0f0f0');
styleProp.set('border.width', 1);
styleProp.set('border.color', '#ccc');

// 批量更新
styleProp.import({
  color: '#333',
  fontSize: 16,
  fontWeight: 'bold'
});
```

### 7.4 条件属性

```typescript
// 条件显示
prop.setAsExpression({
  type: 'JSExpression',
  value: 'this.props.type === "primary" ? "blue" : "gray"'
});

// 动态样式
styleProp.set('display', {
  type: 'JSExpression',
  value: 'this.state.visible ? "block" : "none"'
});
```

## 8. 高级特性

### 8.1 属性监听

```typescript
// 监听属性变化
const dispose = prop.onValueChange((newValue, oldValue) => {
  console.log('属性变化:', oldValue, '->', newValue);
});

// 取消监听
dispose();
```

### 8.2 属性验证

```typescript
// 自定义验证规则
class ValidatedProp extends Prop {
  validate() {
    const value = this.getValue();

    // 必填验证
    if (this.isRequired() && !value) {
      return false;
    }

    // 类型验证
    const expectedType = this.getMeta()?.type;
    if (expectedType && typeof value !== expectedType) {
      return false;
    }

    // 自定义验证
    const validator = this.getMeta()?.validator;
    if (validator) {
      return validator(value);
    }

    return true;
  }
}
```

### 8.3 属性转换

```typescript
// 属性值转换器
class TransformedProp extends Prop {
  getValue() {
    const rawValue = super.getValue();
    const transformer = this.getMeta()?.transformer;

    if (transformer) {
      return transformer(rawValue);
    }

    return rawValue;
  }

  setValue(value: any) {
    const reverseTransformer = this.getMeta()?.reverseTransformer;

    if (reverseTransformer) {
      value = reverseTransformer(value);
    }

    super.setValue(value);
  }
}
```

## 9. 注意事项

### 9.1 性能优化
- 避免频繁的深层嵌套访问
- 使用批量更新减少渲染次数
- 缓存计算结果避免重复计算

### 9.2 类型安全
- 使用 TypeScript 定义属性类型
- 验证输入值的合法性
- 处理类型转换异常

### 9.3 内存管理
- 及时清理不用的插槽节点
- 避免在表达式中引用大对象
- 注意循环引用的问题

### 9.4 表达式安全
- 避免在表达式中执行危险操作
- 限制表达式的执行上下文
- 处理表达式执行异常

## 10. 最佳实践

### 10.1 属性定义模式

```typescript
// 定义属性元数据
const propMeta = {
  name: 'title',
  title: '标题',
  type: 'string',
  defaultValue: '默认标题',
  required: true,
  validator: (value) => value.length <= 100
};

// 创建属性
const prop = new Prop(props, propMeta.defaultValue, propMeta.name);
```

### 10.2 安全的属性访问

```typescript
// 安全获取嵌套属性
function safeGetProp(node: Node, path: string, defaultValue?: any) {
  try {
    const prop = node.props.getProp(path);
    return prop?.getValue() ?? defaultValue;
  } catch (error) {
    console.warn(`Failed to get prop: ${path}`, error);
    return defaultValue;
  }
}
```

### 10.3 批量属性更新

```typescript
// 事务式更新
function updateProps(node: Node, updates: Record<string, any>) {
  node.props.transaction(() => {
    Object.entries(updates).forEach(([key, value]) => {
      node.setPropValue(key, value);
    });
  });
}
```
