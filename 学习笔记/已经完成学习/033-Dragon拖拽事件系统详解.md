# Dragon拖拽事件系统详解

## 🎯 概述

Dragon拖拽引擎通过发送`'drag'`事件来协调整个低代码引擎的拖拽交互。这是一个核心的事件驱动系统，连接了拖拽的各个阶段和组件。

## 📡 drag事件的监听者

### **1. Designer类的监听**
```typescript
// packages/designer/src/designer/designer.ts:271-278
this.dragon.onDrag((e) => {
    console.log('Designer 类中 new Dragon 的 onDrag');

    if (this.props?.onDrag) {
        this.props.onDrag(e);  // 调用外部回调
    }
    this.postEvent('drag', e); // 转发到Editor事件总线
});
```

#### **作用效果**
- **外部回调触发**：允许业务代码监听拖拽过程
- **事件总线转发**：将拖拽事件广播到整个引擎
- **调试信息输出**：提供拖拽流程的调试支持

### **2. Plugin级别的监听**
```typescript
// 插件可以通过 designer 实例监听
const designer = editor.get('designer');
designer.dragon.onDrag((e) => {
    // 插件的自定义拖拽处理逻辑
    console.log('插件监听到拖拽事件:', e);
});
```

### **3. Editor事件总线的监听**
```typescript
// 业务代码可以监听Editor级别的事件
editor.eventBus.on('drag', (e) => {
    // 全局拖拽事件处理
    console.log('全局拖拽事件:', e);
});
```

## 🚀 drag事件的触发时机

### **触发位置分析**
```typescript
// packages/designer/src/designer/dragon.ts

// 1. RGL同节点拖拽时
if (fromRglNode && fromRglNode.id === rglNode.id) {
    designer.clearLocation();
    this.clearState();
    this.emitter.emit('drag', locateEvent); // 🔥 触发点1
    return;
}

// 2. RGL可放置位置时
if (this._canDrop) {
    this.emitter.emit('rgl.add.placeholder', {...});
    designer.clearLocation();
    this.clearState();
    this.emitter.emit('drag', locateEvent); // 🔥 触发点2
    return;
}

// 3. 常规拖拽移动时
if (sensor) {
    sensor.fixEvent(locateEvent);
    sensor.locate(locateEvent);
} else {
    designer.clearLocation();
}
this.emitter.emit('drag', locateEvent); // 🔥 触发点3
```

### **触发条件总结**
| 触发场景 | 条件 | 频率 | 作用 |
|---------|------|------|------|
| **RGL同节点拖拽** | `fromRglNode.id === rglNode.id` | 低频 | 清理状态，避免自拖拽 |
| **RGL占位符显示** | `isRGL && _canDrop` | 中频 | 显示占位符，清理状态 |
| **常规拖拽移动** | 鼠标移动时 | 高频 | 实时更新位置，传感器定位 |

## 🎮 drag事件携带的数据

### **ILocateEvent数据结构**
```typescript
interface ILocateEvent extends IPublicModelLocateEvent {
    readonly type: 'LocateEvent';

    // 基础事件信息
    dragObject: IPublicModelDragObject;   // 拖拽对象
    target: Element;                      // 事件目标元素
    originalEvent: MouseEvent | DragEvent; // 原始事件
    sensor?: IPublicModelSensor;          // 活跃的传感器

    // 坐标信息
    globalX: number;                      // 全局X坐标
    globalY: number;                      // 全局Y坐标
    canvasX?: number;                     // 画布X坐标（iframe内）
    canvasY?: number;                     // 画布Y坐标（iframe内）
}
```

### **坐标系统详解**
```typescript
// 坐标转换逻辑
const createLocateEvent = (e: MouseEvent | DragEvent): ILocateEvent => {
    const evt: any = {
        type: 'LocateEvent',
        dragObject,
        target: e.target,
        originalEvent: e,
    };

    const sourceDocument = e.view?.document;

    if (!sourceDocument || sourceDocument === document) {
        // 主文档：直接使用客户端坐标
        evt.globalX = e.clientX;
        evt.globalY = e.clientY;
    } else {
        // iframe文档：需要坐标转换
        const srcSim = masterSensors.find(sim => sim.contentDocument === sourceDocument);
        if (srcSim) {
            const g = srcSim.viewport.toGlobalPoint(e);
            evt.globalX = g.clientX;    // 转换后的全局坐标
            evt.globalY = g.clientY;
            evt.canvasX = e.clientX;    // iframe内的画布坐标
            evt.canvasY = e.clientY;
            evt.sensor = srcSim;
        }
    }
    return evt;
};
```

## 🔄 drag事件的完整效果

### **整体效果达成**
1. **实时位置反馈**：提供拖拽过程中的实时位置更新
2. **传感器协调**：协调多个传感器的工作，找到最合适的投放位置
3. **状态同步**：保持拖拽状态在各个模块间的一致性
4. **视觉反馈**：触发各种视觉反馈的更新（占位符、高亮等）

### **效果流程图**
```mermaid
sequenceDiagram
    participant Dragon as Dragon引擎
    participant Designer as Designer
    participant Plugin as 插件系统
    participant UI as 用户界面
    participant Sensor as 传感器

    Dragon->>Dragon: emit('drag', locateEvent)

    parallel
        Dragon->>Designer: onDrag回调
        Designer->>Designer: postEvent('drag', e)
        Designer->>Plugin: 事件总线转发
        Plugin->>UI: 更新UI反馈
    and
        Dragon->>Sensor: sensor.locate(locateEvent)
        Sensor->>Sensor: 计算投放位置
        Sensor->>UI: 更新位置指示器
    end

    UI->>UI: 综合显示拖拽效果
```

## ⚙️ drag事件的配置项

### **Dragon事件配置**
```typescript
// 通过Dragon实例配置
designer.dragon.onDrag((e: ILocateEvent) => {
    // 自定义拖拽处理逻辑
    console.log('拖拽事件:', e);

    // 可配置的处理选项
    const config = {
        enableRealTimeUpdate: true,    // 启用实时更新
        showPositionIndicator: true,   // 显示位置指示器
        enableCollisionDetection: true, // 启用碰撞检测
        updateFrequency: 'high'        // 更新频率：low/medium/high
    };
});
```

### **Designer回调配置**
```typescript
// 通过DesignerProps配置
const designerProps = {
    onDrag: (e: ILocateEvent) => {
        // 业务级别的拖拽处理
        analytics.track('component_drag', {
            componentName: e.dragObject?.type,
            position: { x: e.globalX, y: e.globalY }
        });
    },
    onDragstart: (e: ILocateEvent) => {
        // 拖拽开始处理
    },
    onDragend: (e: any, loc?: DropLocation) => {
        // 拖拽结束处理
    }
};
```

### **全局事件配置**
```typescript
// 通过Editor事件总线配置
editor.eventBus.on('drag', (e: ILocateEvent) => {
    // 全局级别的拖拽监听

    // 可获取的事件信息
    const eventInfo = {
        dragType: e.dragObject?.type,           // 拖拽类型：Node/NodeData
        targetElement: e.target,                // 目标DOM元素
        globalPosition: [e.globalX, e.globalY], // 全局坐标
        canvasPosition: [e.canvasX, e.canvasY], // 画布坐标（if iframe）
        sensor: e.sensor?.constructor.name,     // 活跃传感器类型
        timestamp: Date.now()                   // 事件时间戳
    };
});
```

## 📊 drag事件性能特性

### **高频事件优化**
```typescript
// 性能优化机制
const drag = (e: MouseEvent | DragEvent) => {
    // 1. 无效位置过滤
    if (isInvalidPoint(e, lastArrive)) return;

    // 2. 相同位置防抖
    if (lastArrive && isSameAs(e, lastArrive)) {
        lastArrive = e;
        return;
    }

    // 3. 事件缓存更新
    lastArrive = e;

    // 4. 发送事件
    this.emitter.emit('drag', locateEvent);
};
```

### **性能监控配置**
```typescript
let dragEventCount = 0;
let lastDragTime = Date.now();

designer.dragon.onDrag((e) => {
    dragEventCount++;
    const now = Date.now();

    if (now - lastDragTime > 1000) {
        console.log(`拖拽事件频率: ${dragEventCount}/秒`);
        dragEventCount = 0;
        lastDragTime = now;
    }
});
```

## 🎨 drag事件的扩展使用

### **自定义拖拽行为**
```typescript
// 注册自定义拖拽处理器
class CustomDragHandler {
    constructor(designer: Designer) {
        designer.dragon.onDrag(this.handleDrag.bind(this));
    }

    handleDrag(e: ILocateEvent) {
        const { dragObject, globalX, globalY } = e;

        // 自定义逻辑：磁性吸附
        if (this.shouldSnapToGrid(globalX, globalY)) {
            const snappedPosition = this.snapToGrid(globalX, globalY);
            this.showSnapIndicator(snappedPosition);
        }

        // 自定义逻辑：碰撞预警
        if (this.detectCollision(e)) {
            this.showCollisionWarning();
        }
    }

    snapToGrid(x: number, y: number) {
        const gridSize = 20;
        return {
            x: Math.round(x / gridSize) * gridSize,
            y: Math.round(y / gridSize) * gridSize
        };
    }
}
```

### **拖拽分析工具**
```typescript
// 拖拽行为分析器
class DragAnalyzer {
    private dragPath: Array<{x: number, y: number, timestamp: number}> = [];

    constructor(designer: Designer) {
        designer.dragon.onDragstart(() => {
            this.dragPath = [];
            this.startTime = Date.now();
        });

        designer.dragon.onDrag((e) => {
            this.dragPath.push({
                x: e.globalX,
                y: e.globalY,
                timestamp: Date.now()
            });
        });

        designer.dragon.onDragend(() => {
            this.analyzeDragBehavior();
        });
    }

    analyzeDragBehavior() {
        const dragDuration = Date.now() - this.startTime;
        const dragDistance = this.calculateTotalDistance();
        const dragSpeed = dragDistance / dragDuration;

        console.log('拖拽分析:', {
            duration: dragDuration,    // 拖拽时长
            distance: dragDistance,    // 拖拽距离
            speed: dragSpeed,         // 拖拽速度
            pathPoints: this.dragPath.length // 路径点数
        });
    }
}
```

## 🎛️ drag事件配置参数详解

### **事件频率控制**
```typescript
// engineConfig中的相关配置
const dragConfig = {
    // 事件频率控制
    dragEventThrottle: 16,           // 拖拽事件节流间隔（毫秒）

    // 坐标精度控制
    positionPrecision: 1,            // 坐标精度（像素）

    // 性能优化配置
    enableDragOptimization: true,    // 启用拖拽性能优化
    maxDragEventPerSecond: 60,       // 最大事件频率（次/秒）

    // 调试配置
    enableDragDebug: false,          // 启用拖拽调试模式
    logDragEvents: false,            // 记录拖拽事件日志
};

engineConfig.set('dragConfig', dragConfig);
```

### **传感器选择配置**
```typescript
// 传感器优先级配置
const sensorConfig = {
    sensorPriority: [
        'BuiltinSimulatorHost',  // 内置模拟器传感器（最高优先级）
        'OutlineTreeSensor',     // 大纲树传感器
        'CustomSensor'           // 自定义传感器
    ],

    sensorSwitchThreshold: 10,   // 传感器切换的距离阈值
    enableSensorDebug: false     // 启用传感器调试
};
```

## 🔧 drag事件的实际应用

### **1. 实时位置指示器**
```typescript
class PositionIndicator {
    private indicator: HTMLElement;

    constructor(designer: Designer) {
        this.indicator = this.createIndicator();

        designer.dragon.onDrag((e) => {
            this.updatePosition(e.globalX, e.globalY);
            this.showTargetInfo(e.dragObject);
        });

        designer.dragon.onDragend(() => {
            this.hide();
        });
    }

    updatePosition(x: number, y: number) {
        this.indicator.style.left = `${x}px`;
        this.indicator.style.top = `${y}px`;
        this.indicator.style.display = 'block';
    }
}
```

### **2. 拖拽约束检查**
```typescript
class DragConstraints {
    constructor(designer: Designer) {
        designer.dragon.onDrag((e) => {
            const { dragObject, target } = e;

            // 检查拖拽约束
            if (!this.checkDragConstraints(dragObject, target)) {
                // 显示约束提示
                this.showConstraintWarning(dragObject, target);
                // 可以选择阻止拖拽继续
                return false;
            }
        });
    }

    checkDragConstraints(dragObject: any, target: Element) {
        // 自定义约束逻辑
        const constraints = {
            maxNestingLevel: 5,      // 最大嵌套层级
            forbiddenContainers: [], // 禁止的容器类型
            requiredPermissions: []  // 需要的权限
        };

        return this.validateConstraints(dragObject, target, constraints);
    }
}
```

### **3. 拖拽数据收集**
```typescript
class DragDataCollector {
    private dragData: any[] = [];

    constructor(designer: Designer) {
        designer.dragon.onDragstart((e) => {
            this.startCollecting(e);
        });

        designer.dragon.onDrag((e) => {
            this.collectDragData(e);
        });

        designer.dragon.onDragend((e, location) => {
            this.finishCollecting(e, location);
            this.sendAnalytics();
        });
    }

    collectDragData(e: ILocateEvent) {
        this.dragData.push({
            timestamp: Date.now(),
            position: { x: e.globalX, y: e.globalY },
            target: e.target?.className,
            sensorType: e.sensor?.constructor.name,
            dragObjectType: e.dragObject?.type
        });
    }

    sendAnalytics() {
        // 发送拖拽行为分析数据
        analytics.track('drag_completed', {
            duration: this.getDragDuration(),
            pathComplexity: this.calculatePathComplexity(),
            targetChanges: this.countTargetChanges(),
            sensorSwitches: this.countSensorSwitches()
        });
    }
}
```

## 📈 drag事件的调试技巧

### **调试事件流**
```typescript
// 全面的拖拽事件调试器
class DragEventDebugger {
    private eventLog: any[] = [];

    constructor(designer: Designer) {
        // 监听所有拖拽相关事件
        const events = ['dragstart', 'drag', 'dragend'];

        events.forEach(eventName => {
            designer.dragon.emitter.on(eventName, (e) => {
                this.logEvent(eventName, e);
            });
        });

        // 监听RGL事件
        const rglEvents = ['rgl.sleeping', 'rgl.add.placeholder', 'rgl.remove.placeholder', 'rgl.drop'];
        rglEvents.forEach(eventName => {
            designer.dragon.emitter.on(eventName, (data) => {
                this.logEvent(eventName, data);
            });
        });
    }

    logEvent(eventName: string, data: any) {
        const logEntry = {
            event: eventName,
            timestamp: Date.now(),
            data: this.serializeEventData(data)
        };

        this.eventLog.push(logEntry);

        // 控制台输出（开发模式）
        if (process.env.NODE_ENV === 'development') {
            console.log(`🐉 Dragon Event: ${eventName}`, logEntry);
        }
    }

    // 导出事件日志
    exportEventLog() {
        const blob = new Blob([JSON.stringify(this.eventLog, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drag-events-${Date.now()}.json`;
        a.click();
    }
}
```

## 🎯 总结

### **drag事件的核心价值**
1. **统一协调**：作为拖拽系统的中央事件，协调所有相关组件
2. **实时反馈**：提供高频率的位置和状态更新
3. **扩展性强**：支持插件和业务代码的自定义处理
4. **跨框架支持**：处理主文档和iframe之间的坐标转换

### **监听者生态**
- **Designer类**：核心业务逻辑处理
- **插件系统**：功能扩展和定制
- **业务代码**：自定义交互和分析
- **调试工具**：开发和诊断支持

### **配置灵活性**
- **事件频率控制**：适应不同性能需求
- **传感器管理**：智能选择最佳响应器
- **约束检查**：支持复杂的拖拽规则
- **数据收集**：便于分析和优化

**drag事件是Dragon拖拽引擎实现复杂交互的核心机制，通过事件驱动的方式连接了拖拽系统的各个环节。**
