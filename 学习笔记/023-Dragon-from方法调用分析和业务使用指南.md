# Dragon.from 方法调用分析和业务使用指南

## 📍 from 方法调用位置分析

### 1️⃣ **当前调用位置汇总**

根据代码分析，Dragon 的 `from` 方法调用位置**非常少**：

| 调用位置 | 文件路径 | 调用类型 | 说明 |
|---------|----------|----------|------|
| **测试代码** | `packages/designer/tests/designer/dragon.test.ts:226,318` | 单元测试 | 测试 from 方法功能 |
| **Shell API** | `packages/shell/src/model/dragon.ts:99` | API 封装 | 对外暴露的公开接口 |

### 2️⃣ **重要发现**

#### **🚨 关键问题：组件库面板实现缺失**
- **低代码引擎本身没有内置组件库面板的实现**
- **from 方法主要是为了给业务方实现组件库面板提供 API**
- **引擎只提供了拖拽框架，具体的组件库面板需要业务自己实现**

#### **📋 引擎内置的拖拽场景**
1. **画布内拖拽**：使用 `setupDragAndClick()` → 直接调用 `boost()`
2. **大纲面板拖拽**：使用 `tree.onMouseDown()` → 直接调用 `boost()`
3. **边框调整拖拽**：使用 `drag-resize-engine.from()` → 专用拖拽引擎

## 🎯 from 方法业务使用指南

### 3️⃣ **from 方法的设计意图**

#### **💡 核心目的**
`from` 方法是专门为**组件库面板的拖拽实现**而设计的 API：

```typescript
// packages/types/src/shell/model/dragon.ts:40-48
/**
 * 设置拖拽监听的区域 shell，以及自定义拖拽转换函数 boost
 * set a html element as shell to dragon as monitoring target, and
 * set boost function which is used to transform a MouseEvent to type
 * IPublicTypeDragNodeDataObject.
 * @param shell 拖拽监听的区域
 * @param boost 拖拽转换函数
 */
from(shell: Element, boost: (e: MouseEvent) => IPublicTypeDragNodeDataObject | null): any;
```

#### **🎨 使用场景**
- **组件库面板**：展示可拖拽的组件列表
- **自定义拖拽区域**：需要从某个容器拖拽内容到画布
- **第三方组件库集成**：集成外部组件库到低代码编辑器

### 4️⃣ **业务中的使用方式**

#### **✅ 可以使用，通过公开 API**

```typescript
// 通过 common.designerCabin.dragon 访问（已废弃，建议使用 canvas.dragon）
const dragon = common.designerCabin.dragon;

// 推荐使用 canvas.dragon
const { canvas } = plugins;
const dragon = canvas.dragon;

// 设置拖拽监听
const cleanup = dragon.from(componentListElement, (e: MouseEvent) => {
  // 从 MouseEvent 转换为拖拽对象
  const componentMeta = getComponentFromEvent(e);
  if (!componentMeta) return null;

  return {
    type: 'NodeData',
    data: componentMeta
  };
});

// 清理监听器
cleanup();
```

#### **📦 组件库面板实现示例**

```typescript
// 业务组件库面板实现示例
import { createElement, Component } from 'react';
import { plugins } from '@alilc/lowcode-engine';

class ComponentPanel extends Component {
  private cleanupFns: (() => void)[] = [];

  componentDidMount() {
    this.setupDragging();
  }

  componentWillUnmount() {
    // 清理所有拖拽监听器
    this.cleanupFns.forEach(fn => fn());
  }

  setupDragging = () => {
    const { canvas } = plugins;
    const dragon = canvas.dragon;

    if (!dragon) {
      console.warn('Dragon 实例未就绪');
      return;
    }

    // 为每个组件项设置拖拽
    this.componentRefs.forEach((ref, index) => {
      if (ref.current) {
        const cleanup = dragon.from(ref.current, (e: MouseEvent) => {
          // 获取组件元数据
          const componentData = this.components[index];

          return {
            type: 'NodeData', // 表示这是新组件数据
            data: {
              componentName: componentData.componentName,
              title: componentData.title,
              snippet: componentData.snippet, // 组件的 schema 片段
              // ... 其他元数据
            }
          };
        });

        this.cleanupFns.push(cleanup);
      }
    });
  };

  render() {
    return (
      <div className="component-panel">
        {this.props.components.map((component, index) => (
          <div
            key={component.componentName}
            ref={this.componentRefs[index]}
            className="component-item"
            draggable={false} // 使用引擎的拖拽，不用浏览器原生拖拽
          >
            <img src={component.screenshot} alt={component.title} />
            <span>{component.title}</span>
          </div>
        ))}
      </div>
    );
  }
}
```

### 5️⃣ **完整的组件库面板插件实现**

```typescript
// 完整的组件库面板插件示例
import { IPublicModelPluginContext } from '@alilc/lowcode-types';

const ComponentLibraryPlugin = (ctx: IPublicModelPluginContext) => {
  return {
    async init() {
      const { skeleton, canvas, material } = ctx;

      // 注册组件库面板到左侧区域
      skeleton.add({
        area: 'leftArea',
        type: 'PanelDock',
        name: 'componentsPanel',
        content: ComponentPanel,
        contentProps: {
          // 传递必要的上下文
          canvas,
          material,
        },
        props: {
          title: '组件库',
          icon: 'component',
          description: '拖拽组件到画布',
        },
      });
    },
  };
};

// 注册插件
const LowCodeEngine = await import('@alilc/lowcode-engine');
await LowCodeEngine.plugins.register(ComponentLibraryPlugin);
```

### 6️⃣ **高级使用场景**

#### **🔧 自定义拖拽转换逻辑**

```typescript
const setupAdvancedDragging = () => {
  const dragon = canvas.dragon;

  const cleanup = dragon.from(containerElement, (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // 复杂的组件识别逻辑
    const componentType = target.dataset.componentType;
    const componentData = getComponentMetadata(componentType);

    // 根据不同类型返回不同的拖拽数据
    switch (componentType) {
      case 'layout':
        return {
          type: 'NodeData',
          data: {
            componentName: 'Div',
            snippet: {
              componentName: 'Div',
              props: {
                style: { display: 'flex', flexDirection: 'column' }
              },
              children: []
            }
          }
        };

      case 'form-control':
        return {
          type: 'NodeData',
          data: {
            componentName: 'Input',
            snippet: {
              componentName: 'Input',
              props: {
                placeholder: '请输入...',
                size: 'medium'
              }
            }
          }
        };

      default:
        return null;
    }
  });

  return cleanup;
};
```

#### **🎛️ 动态组件加载**

```typescript
const setupDynamicComponentDragging = async () => {
  const dragon = canvas.dragon;

  const cleanup = dragon.from(containerElement, async (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const componentId = target.dataset.componentId;

    if (!componentId) return null;

    // 动态加载组件元数据
    try {
      const componentMeta = await loadComponentMetadata(componentId);

      return {
        type: 'NodeData',
        data: {
          componentName: componentMeta.componentName,
          snippet: componentMeta.snippet,
          // 可以包含额外的配置
          extraProps: {
            dynamicallyLoaded: true,
            loadTime: Date.now(),
          }
        }
      };
    } catch (error) {
      console.error('组件元数据加载失败:', error);
      return null;
    }
  });

  return cleanup;
};
```

## 🚧 使用注意事项

### 7️⃣ **最佳实践**

#### **⚡ 性能优化**
```typescript
// ❌ 错误：为每个组件项单独设置监听器
components.forEach(component => {
  dragon.from(component.element, boostFn);
});

// ✅ 正确：使用事件代理，单一监听器处理所有组件
dragon.from(containerElement, (e: MouseEvent) => {
  const componentElement = e.target.closest('.component-item');
  if (!componentElement) return null;

  const componentId = componentElement.dataset.componentId;
  return getComponentDragData(componentId);
});
```

#### **🛡️ 错误处理**
```typescript
const setupSafeDragging = () => {
  const dragon = canvas.dragon;

  if (!dragon) {
    console.warn('Dragon 实例不可用，请检查引擎初始化状态');
    return () => {}; // 返回空的清理函数
  }

  try {
    const cleanup = dragon.from(element, (e: MouseEvent) => {
      try {
        return getDragData(e);
      } catch (error) {
        console.error('拖拽数据生成失败:', error);
        return null;
      }
    });

    return cleanup;
  } catch (error) {
    console.error('拖拽监听器设置失败:', error);
    return () => {};
  }
};
```

### 8️⃣ **常见问题解决**

#### **❓ from 方法返回 undefined**
```typescript
// 解决方案：确保 Dragon 实例就绪
const setupDraggingWithCheck = async () => {
  // 等待编辑器完全初始化
  await ctx.editor.onceGot('designer');
  await ctx.editor.onceGot('project');

  const dragon = ctx.canvas.dragon;
  if (!dragon || typeof dragon.from !== 'function') {
    throw new Error('Dragon 实例未就绪或 from 方法不可用');
  }

  return dragon.from(element, boostFunction);
};
```

#### **🐛 拖拽数据格式错误**
```typescript
// 确保返回正确的数据格式
const boostFunction = (e: MouseEvent) => {
  return {
    type: 'NodeData', // 必须是 'NodeData' 对于新组件
    data: {
      // 必须包含有效的组件数据
      componentName: 'Button',
      snippet: {
        componentName: 'Button',
        props: {
          children: '按钮',
          type: 'primary'
        }
      }
    }
  };
};
```

## 🎯 总结

### **✅ 能否在业务中使用？**
**可以使用**，Dragon 的 `from` 方法是**专门为业务方实现组件库面板而设计的公开 API**。

### **📝 使用建议**
1. **优先使用 `canvas.dragon.from()`** 而不是已废弃的 `common.designerCabin.dragon.from()`
2. **确保在引擎完全初始化后调用**
3. **使用事件代理优化性能**
4. **添加完善的错误处理**
5. **正确清理监听器避免内存泄漏**

### **🎨 典型应用场景**
- 自定义组件库面板
- 第三方组件库集成
- 业务特定的拖拽交互
- 动态组件加载和拖拽

**from 方法是低代码引擎提供给业务方的重要扩展点，用于实现自定义的组件拖拽功能。**
