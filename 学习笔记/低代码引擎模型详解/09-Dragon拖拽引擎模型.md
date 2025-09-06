# Dragon - 拖拽引擎模型详解

## 1. 模型概述

`Dragon` 是低代码引擎的拖拽引擎，负责处理所有拖拽相关的操作。它管理着从组件库拖拽新组件、画布内组件移动、跨容器拖拽等核心交互功能。Dragon 通过传感器（Sensor）系统实现了灵活的拖拽检测和处理机制。

## 2. 核心属性

### 2.1 基础属性

```typescript
class Dragon {
  // 设计器实例
  designer: Designer;

  // 传感器列表
  sensors: IPublicModelSensor[] = [];

  // 事件发射器
  emitter: IEventBus;

  // 当前活跃的传感器
  _activeSensor?: IPublicModelSensor;

  // 是否正在拖拽
  _dragging: boolean = false;

  // 是否可以投放
  _canDrop: boolean = true;
}
```

### 2.2 拖拽状态

```typescript
{
  // 拖拽对象
  dragObject?: IPublicModelDragObject;

  // 是否复制模式
  copy: boolean = false;

  // 拖拽开始位置
  startPoint?: { x: number; y: number };

  // 当前位置
  currentPoint?: { x: number; y: number };

  // 投放位置
  dropLocation?: IPublicModelDropLocation;

  // 节点实例指针事件状态（保存原始状态）
  nodeInstPointerEvents?: Map<Node, string>;
}
```

### 2.3 拖拽对象类型

```typescript
// 节点拖拽对象（已存在的节点）
interface IPublicModelDragNodeObject {
  type: IPublicEnumDragObjectType.Node;
  nodes: Node[];
}

// 节点数据拖拽对象（新组件）
interface IPublicModelDragNodeDataObject {
  type: IPublicEnumDragObjectType.NodeData;
  data: IPublicTypeNodeData | IPublicTypeNodeData[];
  thumbnail?: string;
  description?: string;
}

// 任意拖拽对象
interface IPublicModelDragAnyObject {
  type: IPublicEnumDragObjectType.Any;
  [key: string]: any;
}
```

## 3. 核心方法

### 3.1 拖拽控制

```typescript
// 启动拖拽
boost(
  dragObject: IPublicModelDragObject,
  boostEvent: MouseEvent | DragEvent,
  fromRglNode?: INode
): void;

// 从元素创建拖拽源
from(
  shell: Element,
  boost: (e: MouseEvent) => IPublicModelDragObject | null
): () => void;

// 结束拖拽
end(): void;

// 取消拖拽
cancel(): void;
```

### 3.2 传感器管理

```typescript
// 添加传感器
addSensor(sensor: IPublicModelSensor): void;

// 移除传感器
removeSensor(sensor: IPublicModelSensor): void;

// 获取主传感器列表
getMasterSensors(): IPublicModelSensor[];

// 切换传感器
switchSensor(sensor: IPublicModelSensor): void;
```

### 3.3 位置计算

```typescript
// 定位投放位置
locate(e: ILocateEvent): IPublicModelDropLocation | null;

// 创建定位事件
createLocateEvent(e: MouseEvent | DragEvent): ILocateEvent;

// 获取拖拽偏移
getDragOffset(): { x: number; y: number };

// 设置投放位置
setDropLocation(location: IPublicModelDropLocation | null): void;
```

### 3.4 事件监听

```typescript
// 监听拖拽开始
onDragstart(fn: (e: IDragStartEvent) => void): IPublicTypeDisposable;

// 监听拖拽中
onDrag(fn: (e: IDragEvent) => void): IPublicTypeDisposable;

// 监听拖拽结束
onDragend(fn: (e: IDragEndEvent) => void): IPublicTypeDisposable;

// 监听投放位置变化
onDropLocationChange(fn: (e: IDropLocationChangeEvent) => void): IPublicTypeDisposable;
```

## 4. 核心原理

### 4.1 拖拽启动流程

```typescript
// boost 方法的核心实现
boost(dragObject: IPublicModelDragObject, boostEvent: MouseEvent | DragEvent) {
  // 1. 初始化拖拽状态
  this.dragObject = dragObject;
  this._dragging = true;
  this.startPoint = { x: boostEvent.clientX, y: boostEvent.clientY };

  // 2. 判断拖拽类型
  const isNewComponent = !isDragNodeObject(dragObject);
  const forceCopy = this.checkForceCopy(dragObject);

  // 3. 设置节点指针事件
  if (!isNewComponent) {
    this.disableNodePointerEvents(dragObject.nodes);
  }

  // 4. 选择合适的传感器
  const sensor = this.chooseSensor(boostEvent);
  this._activeSensor = sensor;

  // 5. 激活传感器
  sensor?.activate(dragObject);

  // 6. 绑定事件处理
  this.bindDragEvents(boostEvent);

  // 7. 触发拖拽开始事件
  this.emitter.emit('dragstart', {
    dragObject,
    event: boostEvent
  });
}
```

### 4.2 传感器机制

```typescript
// 传感器接口
interface IPublicModelSensor {
  // 传感器ID
  id: string;

  // 是否可用
  isAvailable(): boolean;

  // 激活传感器
  activate(dragObject: IPublicModelDragObject): void;

  // 停用传感器
  deactivate(): void;

  // 定位投放位置
  locate(e: ILocateEvent): IPublicModelDropLocation | null;

  // 是否接受拖拽对象
  acceptDragObject(dragObject: IPublicModelDragObject): boolean;
}

// 选择传感器的逻辑
chooseSensor(e: MouseEvent | DragEvent): IPublicModelSensor | undefined {
  // 获取所有可用的传感器
  const availableSensors = this.sensors.filter(s =>
    s.isAvailable() &&
    s.acceptDragObject(this.dragObject!)
  );

  // 根据事件位置选择最合适的传感器
  for (const sensor of availableSensors) {
    const location = sensor.locate(this.createLocateEvent(e));
    if (location) {
      return sensor;
    }
  }

  return availableSensors[0];
}
```

### 4.3 投放位置计算

```typescript
// 定位投放位置
locate(e: ILocateEvent): IPublicModelDropLocation | null {
  if (!this._activeSensor) return null;

  // 使用当前传感器定位
  const location = this._activeSensor.locate(e);

  if (!location) return null;

  // 验证投放位置
  if (!this.validateDropLocation(location)) {
    return null;
  }

  // 更新投放位置
  this.setDropLocation(location);

  return location;
}

// 验证投放位置
validateDropLocation(location: IPublicModelDropLocation): boolean {
  const { target, detail } = location;

  // 检查嵌套规则
  if (this.dragObject && isDragNodeObject(this.dragObject)) {
    const nodes = this.dragObject.nodes;

    // 不能将容器拖入其子节点
    for (const node of nodes) {
      if (node.contains(target)) {
        return false;
      }
    }
  }

  // 检查目标容器的接受规则
  if (!target.canAccept(this.dragObject)) {
    return false;
  }

  return true;
}
```

### 4.4 拖拽事件处理

```typescript
// 拖拽移动处理
private handleDragMove(e: MouseEvent | DragEvent) {
  // 更新当前位置
  this.currentPoint = { x: e.clientX, y: e.clientY };

  // 创建定位事件
  const locateEvent = this.createLocateEvent(e);

  // 定位投放位置
  const location = this.locate(locateEvent);

  // 触发拖拽事件
  this.emitter.emit('drag', {
    dragObject: this.dragObject,
    event: e,
    location
  });
}

// 拖拽结束处理
private handleDragEnd(e: MouseEvent | DragEvent) {
  // 获取最终投放位置
  const location = this.dropLocation;

  // 恢复节点指针事件
  this.restoreNodePointerEvents();

  // 停用传感器
  this._activeSensor?.deactivate();

  // 触发拖拽结束事件
  this.emitter.emit('dragend', {
    dragObject: this.dragObject,
    location,
    copy: this.copy,
    event: e
  });

  // 重置状态
  this.reset();
}
```

## 5. 拖拽场景

### 5.1 从组件库拖拽新组件

```typescript
// 创建拖拽源
dragon.from(componentElement, (e) => {
  // 返回拖拽对象
  return {
    type: IPublicEnumDragObjectType.NodeData,
    data: {
      componentName: 'Button',
      props: {
        text: '按钮'
      }
    }
  };
});
```

### 5.2 画布内移动组件

```typescript
// 在 setupDragAndClick 中启动拖拽
designer.dragon.boost({
  type: IPublicEnumDragObjectType.Node,
  nodes: selectedNodes
}, mouseDownEvent);
```

### 5.3 跨容器拖拽

```typescript
// 拖拽时自动处理父子关系变更
onDragend((e) => {
  const { dragObject, location } = e;

  if (location && isDragNodeObject(dragObject)) {
    // 移动节点到新位置
    const nodes = dragObject.nodes;
    const target = location.target;
    const index = location.detail.index;

    nodes.forEach(node => {
      node.moveTo(target, index);
    });
  }
});
```

### 5.4 RGL（React Grid Layout）拖拽

```typescript
// RGL 特殊处理
if (isRGLNode) {
  designer.dragon.emitter.emit('rgl.switch', {
    action: 'start',
    rglNode
  });

  // 使用特殊的 RGL 传感器
  dragon.boost(dragObject, event, rglNode);
}
```

## 6. 与其他模型的关系

### 6.1 与 Designer 的关系
- Dragon 是 Designer 的核心组件
- Designer 通过 dragon 属性访问
- Designer 监听 Dragon 的事件进行处理

### 6.2 与 Sensor 的关系
- Dragon 管理多个 Sensor
- Sensor 负责具体的拖拽检测
- 不同 Sensor 处理不同的拖拽场景

### 6.3 与 Node 的关系
- 拖拽已存在的 Node
- 创建新的 Node
- 处理 Node 的移动和复制

### 6.4 与 Selection 的关系
- 拖拽选中的节点
- 拖拽结束后更新选择
- 多选拖拽的支持

## 7. 使用方式

### 7.1 基础拖拽

```typescript
// 获取拖拽引擎
const dragon = designer.dragon;

// 监听拖拽事件
dragon.onDragstart((e) => {
  console.log('开始拖拽:', e.dragObject);
});

dragon.onDrag((e) => {
  console.log('拖拽中:', e.location);
});

dragon.onDragend((e) => {
  console.log('拖拽结束:', e.location, e.copy);
});
```

### 7.2 创建拖拽源

```typescript
// 组件面板拖拽源
const dispose = dragon.from(componentPanel, (e) => {
  const component = e.target.dataset.component;

  if (!component) return null;

  return {
    type: IPublicEnumDragObjectType.NodeData,
    data: {
      componentName: component,
      props: getDefaultProps(component)
    },
    thumbnail: getThumbnail(component)
  };
});

// 清理拖拽源
dispose();
```

### 7.3 自定义传感器

```typescript
// 创建自定义传感器
class CustomSensor implements IPublicModelSensor {
  id = 'custom-sensor';

  isAvailable() {
    // 判断传感器是否可用
    return true;
  }

  acceptDragObject(dragObject: IPublicModelDragObject) {
    // 判断是否接受拖拽对象
    return dragObject.type === IPublicEnumDragObjectType.Node;
  }

  locate(e: ILocateEvent): IPublicModelDropLocation | null {
    // 自定义定位逻辑
    const target = this.findDropTarget(e);

    if (!target) return null;

    return {
      target,
      detail: {
        type: IPublicTypeLocationDetailType.Children,
        index: 0,
        valid: true
      },
      source: this.id,
      event: e
    };
  }
}

// 注册传感器
dragon.addSensor(new CustomSensor());
```

### 7.4 拖拽配置

```typescript
// 配置拖拽行为
const dragConfig = {
  // 拖拽延迟
  delay: 100,

  // 拖拽阈值
  threshold: 5,

  // 是否启用复制
  enableCopy: true,

  // 复制键
  copyKey: 'alt',

  // 拖拽时的鼠标样式
  cursor: 'move'
};

// 应用配置
dragon.configure(dragConfig);
```

## 8. 高级特性

### 8.1 拖拽预览

```typescript
// 自定义拖拽预览
class DragPreview {
  private previewElement?: HTMLElement;

  constructor(private dragon: Dragon) {
    dragon.onDragstart(this.showPreview.bind(this));
    dragon.onDrag(this.updatePreview.bind(this));
    dragon.onDragend(this.hidePreview.bind(this));
  }

  private showPreview(e: IDragStartEvent) {
    const { dragObject } = e;

    // 创建预览元素
    this.previewElement = document.createElement('div');
    this.previewElement.className = 'drag-preview';

    // 设置预览内容
    if (isDragNodeObject(dragObject)) {
      this.previewElement.textContent =
        `移动 ${dragObject.nodes.length} 个组件`;
    } else {
      this.previewElement.textContent =
        `新建 ${dragObject.data.componentName}`;
    }

    document.body.appendChild(this.previewElement);
  }

  private updatePreview(e: IDragEvent) {
    if (!this.previewElement) return;

    // 更新位置
    this.previewElement.style.left = `${e.event.clientX + 10}px`;
    this.previewElement.style.top = `${e.event.clientY + 10}px`;

    // 更新状态
    if (e.location) {
      this.previewElement.classList.add('can-drop');
    } else {
      this.previewElement.classList.remove('can-drop');
    }
  }

  private hidePreview() {
    this.previewElement?.remove();
    this.previewElement = undefined;
  }
}
```

### 8.2 拖拽约束

```typescript
// 拖拽约束管理
class DragConstraints {
  constructor(private dragon: Dragon) {}

  // 限制拖拽区域
  constrainToArea(area: DOMRect) {
    this.dragon.onDrag((e) => {
      const { clientX, clientY } = e.event;

      // 检查是否在区域内
      if (clientX < area.left || clientX > area.right ||
          clientY < area.top || clientY > area.bottom) {
        // 取消拖拽
        this.dragon.cancel();
      }
    });
  }

  // 限制拖拽方向
  constrainDirection(direction: 'horizontal' | 'vertical') {
    let startX: number;
    let startY: number;

    this.dragon.onDragstart((e) => {
      startX = e.event.clientX;
      startY = e.event.clientY;
    });

    this.dragon.onDrag((e) => {
      const { clientX, clientY } = e.event;

      if (direction === 'horizontal') {
        // 锁定Y轴
        e.event.clientY = startY;
      } else {
        // 锁定X轴
        e.event.clientX = startX;
      }
    });
  }
}
```

### 8.3 拖拽辅助

```typescript
// 拖拽辅助功能
class DragHelper {
  // 磁吸功能
  enableSnapping(gridSize: number = 10) {
    this.dragon.onDrag((e) => {
      const location = e.location;
      if (!location) return;

      // 计算磁吸位置
      const snappedX = Math.round(e.event.clientX / gridSize) * gridSize;
      const snappedY = Math.round(e.event.clientY / gridSize) * gridSize;

      // 更新位置
      location.detail.x = snappedX;
      location.detail.y = snappedY;
    });
  }

  // 自动滚动
  enableAutoScroll(container: HTMLElement) {
    this.dragon.onDrag((e) => {
      const { clientX, clientY } = e.event;
      const rect = container.getBoundingClientRect();

      const scrollMargin = 50;
      const scrollSpeed = 10;

      // 检查是否需要滚动
      if (clientY < rect.top + scrollMargin) {
        container.scrollTop -= scrollSpeed;
      } else if (clientY > rect.bottom - scrollMargin) {
        container.scrollTop += scrollSpeed;
      }

      if (clientX < rect.left + scrollMargin) {
        container.scrollLeft -= scrollSpeed;
      } else if (clientX > rect.right - scrollMargin) {
        container.scrollLeft += scrollSpeed;
      }
    });
  }
}
```

## 9. 注意事项

### 9.1 性能优化
- 避免在拖拽过程中进行重计算
- 使用防抖处理高频事件
- 及时清理不需要的传感器

### 9.2 内存管理
- 拖拽结束后清理临时数据
- 避免循环引用
- 及时移除事件监听

### 9.3 兼容性处理
- 处理不同浏览器的拖拽差异
- 支持触摸设备
- 处理跨iframe拖拽

### 9.4 用户体验
- 提供清晰的拖拽反馈
- 支持取消操作
- 避免误触发拖拽

## 10. 最佳实践

### 10.1 拖拽管理器

```typescript
// 统一的拖拽管理
class DragManager {
  private disposables: Array<() => void> = [];

  constructor(private dragon: Dragon) {}

  // 注册组件库拖拽
  registerComponentLibrary(element: Element) {
    const dispose = this.dragon.from(element, (e) => {
      const component = this.getComponentFromEvent(e);
      if (!component) return null;

      return this.createDragObject(component);
    });

    this.disposables.push(dispose);
  }

  // 创建拖拽对象
  private createDragObject(component: IComponentMeta): IPublicModelDragObject {
    return {
      type: IPublicEnumDragObjectType.NodeData,
      data: {
        componentName: component.componentName,
        props: component.defaultProps || {}
      },
      thumbnail: component.icon,
      description: component.title
    };
  }

  // 清理资源
  dispose() {
    this.disposables.forEach(fn => fn());
    this.disposables = [];
  }
}
```

### 10.2 拖拽状态管理

```typescript
// 拖拽状态管理
class DragState {
  @observable isDragging = false;
  @observable dragObject: IPublicModelDragObject | null = null;
  @observable dropLocation: IPublicModelDropLocation | null = null;
  @observable canDrop = false;

  constructor(private dragon: Dragon) {
    this.bindEvents();
  }

  private bindEvents() {
    this.dragon.onDragstart(action((e) => {
      this.isDragging = true;
      this.dragObject = e.dragObject;
    }));

    this.dragon.onDrag(action((e) => {
      this.dropLocation = e.location;
      this.canDrop = !!e.location;
    }));

    this.dragon.onDragend(action(() => {
      this.isDragging = false;
      this.dragObject = null;
      this.dropLocation = null;
      this.canDrop = false;
    }));
  }

  @computed get dragInfo() {
    if (!this.isDragging) return null;

    return {
      object: this.dragObject,
      location: this.dropLocation,
      canDrop: this.canDrop
    };
  }
}
```

### 10.3 拖拽测试辅助

```typescript
// 拖拽测试辅助
class DragTestHelper {
  constructor(private dragon: Dragon) {}

  // 模拟拖拽
  simulateDrag(
    dragObject: IPublicModelDragObject,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    // 创建模拟事件
    const startEvent = new MouseEvent('mousedown', {
      clientX: from.x,
      clientY: from.y
    });

    // 启动拖拽
    this.dragon.boost(dragObject, startEvent);

    // 模拟移动
    const moveEvent = new MouseEvent('mousemove', {
      clientX: to.x,
      clientY: to.y
    });

    this.dragon['handleDragMove'](moveEvent);

    // 结束拖拽
    const endEvent = new MouseEvent('mouseup', {
      clientX: to.x,
      clientY: to.y
    });

    this.dragon['handleDragEnd'](endEvent);
  }

  // 验证拖拽结果
  async verifyDragResult(expectedLocation: IPublicModelDropLocation) {
    return new Promise((resolve) => {
      this.dragon.onDragend((e) => {
        const success = this.compareLocations(e.location, expectedLocation);
        resolve(success);
      });
    });
  }
}
```
