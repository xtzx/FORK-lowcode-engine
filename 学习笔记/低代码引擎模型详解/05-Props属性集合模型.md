# Props - 属性集合模型详解

## 1. 模型概述

`Props` 是低代码引擎中管理节点所有属性的集合模型。它是 `Prop` 的容器，负责管理节点的所有属性，包括普通属性、表达式、事件处理器、插槽等。Props 提供了统一的接口来访问和操作节点的属性系统。

## 2. 核心属性

### 2.1 基础属性

```typescript
class Props {
  // 唯一标识
  id: string;

  // 所属节点
  owner: Node;

  // 属性类型
  type: 'map' | 'list';

  // 属性项列表
  items: Prop[] = [];

  // 属性映射表（计算属性）
  maps: Map<string, Prop>;

  // 属性数量
  size: number;
}
```

### 2.2 状态管理

```typescript
{
  // 事务标记
  _transacting: boolean = false;

  // 变更记录
  _changeRecords: Array<{
    prop: Prop;
    oldValue: any;
    newValue: any;
  }> = [];

  // 是否已销毁
  disposed: boolean = false;
}
```

## 3. 核心方法

### 3.1 基础操作

```typescript
// 获取属性
get(path: string, createIfNone?: boolean): Prop | null;
getProp(path: string, createIfNone?: boolean): Prop | null;

// 获取属性值
getValue(path: string): any;
getPropValue(path: string): any;

// 设置属性值
setValue(path: string, value: any): void;
setPropValue(path: string, value: any): void;

// 判断属性是否存在
has(path: string): boolean;

// 删除属性
delete(prop: Prop | string): void;
deleteKey(key: string): void;

// 清空所有属性
clear(): void;
```

### 3.2 批量操作

```typescript
// 导入属性
import(data?: IPublicTypePropsMap | IPublicTypePropsList | Props | null): void;

// 合并属性
merge(data: IPublicTypePropsMap | IPublicTypePropsList): void;

// 导出属性
export(stage?: IPublicEnumTransformStage): IPublicTypePropsMap | IPublicTypePropsList;

// 事务操作
transaction(fn: () => void): void;

// 批量设置
batchSet(updates: Record<string, any>): void;
```

### 3.3 查询操作

```typescript
// 遍历属性
forEach(fn: (prop: Prop, key: string) => void): void;

// 映射属性
map<T>(fn: (prop: Prop, key: string) => T): T[];

// 过滤属性
filter(fn: (prop: Prop, key: string) => boolean): Prop[];

// 查找属性
find(fn: (prop: Prop, key: string) => boolean): Prop | undefined;

// 获取所有键
keys(): string[];

// 获取所有值
values(): any[];

// 获取键值对
entries(): Array<[string, any]>;
```

### 3.4 高级操作

```typescript
// 查询属性（支持通配符）
query(path: string, createIfNone?: boolean): Prop | Prop[] | null;

// 添加属性
add(value: any, key?: string | number, spread?: boolean, options?: any): Prop;

// 清理无效属性
purge(): void;

// 转换为数据
toData(): IPublicTypePropsMap | IPublicTypePropsList;

// 获取架构
getSchema(): IPublicTypePropsMap;
```

### 3.5 事件相关

```typescript
// 监听属性变化
onChange(fn: (info: { prop: Prop; oldValue: any; newValue: any }) => void): IPublicTypeDisposable;

// 监听属性添加
onAdd(fn: (prop: Prop) => void): IPublicTypeDisposable;

// 监听属性删除
onDelete(fn: (prop: Prop) => void): IPublicTypeDisposable;

// 批量变更通知
notifyChanges(): void;
```

## 4. 核心原理

### 4.1 属性存储结构

```typescript
// 双重存储机制
class Props {
  // 数组存储保持顺序
  @obx.shallow items: Prop[] = [];

  // Map存储提供快速查找
  @computed get maps(): Map<string, Prop> {
    const maps = new Map();
    this.items.forEach(prop => {
      if (prop.key) {
        maps.set(prop.key, prop);
      }
    });
    return maps;
  }
}
```

### 4.2 路径解析机制

```typescript
// 支持点号路径访问
getProp('style.color')
  -> getProp('style')?.get('color')

// 支持数组索引访问
getProp('items.0.text')
  -> getProp('items')?.get(0)?.get('text')

// 支持通配符查询
query('style.*')
  -> [colorProp, fontSizeProp, ...]
```

### 4.3 事务机制

```typescript
// 批量更新优化
transaction(fn: () => void) {
  this._transacting = true;
  this._changeRecords = [];

  try {
    fn();
  } finally {
    this._transacting = false;
    if (this._changeRecords.length > 0) {
      this.notifyChanges();
    }
  }
}
```

### 4.4 响应式更新

```typescript
// 属性变更传播
onPropChange(prop: Prop) {
  if (!this._transacting) {
    // 立即通知
    this.owner.emitPropChange({ prop });
  } else {
    // 收集变更
    this._changeRecords.push({
      prop,
      oldValue: prop.oldValue,
      newValue: prop.value
    });
  }
}
```

## 5. 属性类型支持

### 5.1 Map类型（对象）

```typescript
// 对象形式的属性
props.import({
  title: '标题',
  visible: true,
  style: {
    color: '#333',
    fontSize: 14
  }
});
```

### 5.2 List类型（数组）

```typescript
// 数组形式的属性（用于spread）
props.import([
  { key: 'className', value: 'container' },
  { key: 'id', value: 'main' },
  { spread: true, value: restProps }
]);
```

### 5.3 混合类型

```typescript
// 支持各种属性类型
props.import({
  // 字面量
  text: 'Hello',

  // 表达式
  visible: {
    type: 'JSExpression',
    value: 'this.state.show'
  },

  // 函数
  onClick: {
    type: 'JSFunction',
    value: 'function() { console.log("click"); }'
  },

  // 插槽
  header: {
    type: 'JSSlot',
    value: []
  }
});
```

## 6. 与其他模型的关系

### 6.1 与 Node 的关系
- Props 属于某个 Node
- Node 通过 props 属性访问 Props
- Props 变更会触发 Node 重新渲染

### 6.2 与 Prop 的关系
- Props 是 Prop 的容器
- 管理多个 Prop 实例
- 提供统一的访问接口

### 6.3 与 SettingTopEntry 的关系
- SettingTopEntry 提供属性设置面板
- Props 存储实际的属性数据
- 通过 setter 进行属性编辑

## 7. 使用方式

### 7.1 基础使用

```typescript
// 获取节点属性集合
const props = node.props;

// 设置单个属性
props.setPropValue('title', '新标题');

// 获取属性值
const title = props.getPropValue('title');

// 批量更新
props.merge({
  title: '标题',
  visible: true,
  disabled: false
});
```

### 7.2 嵌套属性操作

```typescript
// 设置嵌套属性
props.setPropValue('style.color', '#ff0000');
props.setPropValue('style.border.width', 1);

// 获取嵌套属性
const color = props.getPropValue('style.color');

// 批量设置嵌套属性
props.setPropValue('style', {
  color: '#333',
  fontSize: 16,
  border: {
    width: 1,
    style: 'solid',
    color: '#ccc'
  }
});
```

### 7.3 事务操作

```typescript
// 批量更新避免多次渲染
props.transaction(() => {
  props.setPropValue('title', '新标题');
  props.setPropValue('visible', true);
  props.setPropValue('style.color', '#000');
  props.delete('deprecated');
});
```

### 7.4 属性监听

```typescript
// 监听所有属性变化
const dispose = props.onChange(({ prop, oldValue, newValue }) => {
  console.log(`属性 ${prop.key} 从 ${oldValue} 变为 ${newValue}`);
});

// 监听特定属性
const titleProp = props.getProp('title');
titleProp?.onValueChange((newValue) => {
  console.log('标题变为:', newValue);
});
```

## 8. 高级特性

### 8.1 属性校验

```typescript
// 扩展Props添加校验
class ValidatedProps extends Props {
  setPropValue(path: string, value: any) {
    const prop = this.getProp(path, true);
    const meta = this.owner.componentMeta.props?.find(p => p.name === path);

    // 类型校验
    if (meta?.type && typeof value !== meta.type) {
      console.warn(`属性 ${path} 类型错误`);
      return;
    }

    // 自定义校验
    if (meta?.validator && !meta.validator(value)) {
      console.warn(`属性 ${path} 校验失败`);
      return;
    }

    super.setPropValue(path, value);
  }
}
```

### 8.2 属性拦截

```typescript
// 属性访问代理
const propsProxy = new Proxy(props, {
  get(target, key) {
    console.log('访问属性:', key);
    return target.getPropValue(key);
  },

  set(target, key, value) {
    console.log('设置属性:', key, value);
    target.setPropValue(key, value);
    return true;
  }
});
```

### 8.3 属性转换

```typescript
// 导入时转换
props.import(data, {
  transformers: {
    // 颜色值转换
    color: (value) => {
      if (typeof value === 'string' && !value.startsWith('#')) {
        return `#${value}`;
      }
      return value;
    },

    // 尺寸单位转换
    size: (value) => {
      if (typeof value === 'number') {
        return `${value}px`;
      }
      return value;
    }
  }
});
```

## 9. 注意事项

### 9.1 性能优化
- 使用事务进行批量更新
- 避免深层嵌套的频繁访问
- 及时销毁不用的监听器

### 9.2 内存管理
- 大对象属性考虑懒加载
- 清理无用的属性
- 避免属性中的循环引用

### 9.3 类型安全
- 使用 TypeScript 定义属性类型
- 进行属性校验
- 处理undefined和null值

### 9.4 兼容性
- 处理旧版本的属性格式
- 提供属性迁移机制
- 保持向后兼容

## 10. 最佳实践

### 10.1 属性初始化

```typescript
// 完整的属性初始化
function initializeProps(node: Node, schema: IPublicTypePropsMap) {
  // 合并默认值
  const defaultProps = node.componentMeta.defaultProps || {};
  const mergedProps = { ...defaultProps, ...schema };

  // 导入属性
  node.props.import(mergedProps);

  // 验证必需属性
  const requiredProps = node.componentMeta.props?.filter(p => p.required) || [];
  requiredProps.forEach(meta => {
    if (!node.props.has(meta.name)) {
      console.warn(`缺少必需属性: ${meta.name}`);
      node.props.setPropValue(meta.name, meta.defaultValue);
    }
  });
}
```

### 10.2 属性迁移

```typescript
// 版本迁移
function migrateProps(props: Props, fromVersion: string, toVersion: string) {
  if (fromVersion === '1.0' && toVersion === '2.0') {
    // 重命名属性
    if (props.has('text')) {
      props.setPropValue('content', props.getPropValue('text'));
      props.delete('text');
    }

    // 转换属性格式
    const size = props.getPropValue('size');
    if (typeof size === 'string') {
      props.setPropValue('size', {
        width: size,
        height: size
      });
    }
  }
}
```

### 10.3 智能属性管理

```typescript
// 智能属性管理器
class SmartProps {
  constructor(private props: Props) {}

  // 条件设置
  setIf(condition: boolean, path: string, value: any) {
    if (condition) {
      this.props.setPropValue(path, value);
    }
  }

  // 切换布尔值
  toggle(path: string) {
    const current = this.props.getPropValue(path);
    this.props.setPropValue(path, !current);
  }

  // 增量更新
  increment(path: string, delta: number = 1) {
    const current = this.props.getPropValue(path) || 0;
    this.props.setPropValue(path, current + delta);
  }
}
```
