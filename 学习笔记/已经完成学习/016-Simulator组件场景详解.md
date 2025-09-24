# Simulator 组件场景详解

## 一、概述

在低代码引擎中，`Simulator` 是设计器的核心组件之一，负责提供可视化的设计画布。根据不同场景和需求，系统会使用不同的 Simulator 实现。

## 二、组件选择逻辑

```typescript
const Simulator = designer.simulatorComponent || BuiltinSimulatorHostView;
```

这个简单的逻辑决定了使用哪个模拟器：
- 如果提供了自定义模拟器（`designer.simulatorComponent`），则使用自定义版本
- 否则使用内置默认模拟器（`BuiltinSimulatorHostView`）

## 三、不同场景下的 Simulator 组件

### 3.1 场景一：默认标准设计器场景

**使用组件**：`BuiltinSimulatorHostView`

**文件位置**：`packages/designer/src/builtin-simulator/host-view.tsx`

**使用场景**：
- ✅ 99% 的低代码设计场景
- ✅ 标准的拖拽式页面搭建
- ✅ 需要 iframe 隔离的场景
- ✅ 支持多设备预览（PC、平板、手机）

**主要功能**：
1. **iframe 容器管理**
   - 创建和管理 iframe 沙箱环境
   - 注入必要的运行时资源（React、组件库等）
   - 处理跨框架通信

2. **设备模拟**
   - 支持不同设备类型切换（desktop、tablet、phone）
   - 自适应视口大小调整
   - 设备外框样式渲染

3. **画布缩放**
   - 支持缩放比例调整（25%、50%、75%、100%、150%、200%）
   - 自动适应屏幕大小
   - 保持设计精度

4. **BEM 工具集成**
   - 选择框显示（BorderSelecting）
   - 悬停提示（BorderDetecting）
   - 调整手柄（BorderResizing）
   - 插入指示线（Insertion）

**架构层次**：
```
BuiltinSimulatorHostView（模拟器容器）
├── Canvas（画布层）
│   ├── 设备外框渲染
│   └── 视口管理
├── BemTools（辅助工具层）
│   ├── 选择框
│   ├── 悬停框
│   └── 插入线
└── Content（内容层）
    └── iframe（渲染沙箱）
```

### 3.2 场景二：自定义模拟器场景

**使用组件**：用户提供的自定义组件

**文件位置**：由用户定义

**使用场景**：
- 🎨 **特殊 UI 需求**
  - 需要自定义的画布样式
  - 特殊的设备模拟效果
  - 品牌化的设计器外观

- 🔧 **功能扩展**
  - 需要额外的设计工具
  - 集成第三方设计系统
  - 特殊的交互模式

- 📱 **特殊设备**
  - 车载系统
  - 智能电视
  - IoT 设备
  - 小程序

- 🚀 **性能优化**
  - 不需要 iframe 隔离
  - 轻量级渲染方案
  - 特殊的渲染优化策略

**实现要求**：
```typescript
interface CustomSimulator extends React.Component {
  // 必须实现的属性
  host: ISimulatorHost;

  // 必须实现的方法
  setProps(props: SimulatorProps): void;
  mountContentFrame(frame: HTMLIFrameElement): void;

  // 可选的扩展方法
  onDeviceChange?(device: string): void;
  onScaleChange?(scale: number): void;
}
```

**示例代码**：
```typescript
class MyCustomSimulator extends Component {
  host: CustomSimulatorHost;

  constructor(props) {
    super(props);
    this.host = new CustomSimulatorHost(props.project);
  }

  render() {
    return (
      <div className="my-custom-simulator">
        {/* 自定义渲染逻辑 */}
        <MyCustomCanvas />
        <MyCustomTools />
      </div>
    );
  }
}

// 使用自定义模拟器
<DesignerView
  simulatorComponent={MyCustomSimulator}
  // ... 其他属性
/>
```

### 3.3 场景三：文档视图场景

**使用组件**：继承自 Designer 的配置

**文件位置**：`packages/designer/src/document/document-view.tsx`

**使用场景**：
- 📄 单个文档的独立视图
- 🔀 多文档切换场景
- 📑 分页设计模式

**特点**：
- 每个文档可以有独立的模拟器配置
- 支持文档级别的暂停和恢复
- 可以显示文档信息层

**代码实现**：
```typescript
export class DocumentView extends Component<{ document: IDocumentModel }> {
  render() {
    const { document } = this.props;
    const { simulatorProps } = document;
    // 使用文档所属设计器的模拟器配置
    const Simulator = document.designer.simulatorComponent || BuiltinSimulatorHostView;

    return (
      <div className={classNames('lc-document', {
        'lc-document-hidden': document.suspensed,
      })}>
        <div className="lc-simulator-shell">
          <Simulator {...simulatorProps} />
        </div>
        <DocumentInfoView document={document} />
      </div>
    );
  }
}
```

### 3.4 场景四：项目视图场景

**使用组件**：主设计器配置的模拟器

**文件位置**：`packages/designer/src/project/project-view.tsx`

**使用场景**：
- 🏗️ 完整项目的设计视图
- 📊 多页面管理
- 🎯 主设计界面

**特点**：
- 显示加载状态
- 管理渲染器就绪状态
- 统一的项目级配置

**代码实现**：
```typescript
export class ProjectView extends Component<{ designer: Designer }> {
  render() {
    const { designer } = this.props;
    const { project, projectSimulatorProps: simulatorProps } = designer;
    const Simulator = designer.simulatorComponent || BuiltinSimulatorHostView;
    const Loading = engineConfig.get('loadingComponent', BuiltinLoading);

    return (
      <div className="lc-project">
        <div className="lc-simulator-shell">
          {!project?.simulator?.renderer && <Loading />}
          <Simulator {...simulatorProps} />
        </div>
      </div>
    );
  }
}
```

## 四、配置方式对比

### 4.1 通过 DesignerView 配置

```typescript
<DesignerView
  simulatorComponent={MyCustomSimulator}
  simulatorProps={{
    device: 'phone',
    scale: 0.5,
    // ... 其他配置
  }}
/>
```

### 4.2 通过 Designer 实例配置

```typescript
const designer = new Designer({
  simulatorComponent: MyCustomSimulator,
  simulatorProps: {
    device: 'tablet',
    // ... 其他配置
  }
});
```

### 4.3 通过 DesignerPlugin 配置

```typescript
<DesignerPlugin
  simulatorComponent={MyCustomSimulator}
  // ... 其他配置
/>
```

## 五、最佳实践

### 5.1 选择合适的模拟器

| 需求 | 推荐方案 | 原因 |
|-----|---------|------|
| 标准页面搭建 | BuiltinSimulatorHostView | 功能完善，稳定可靠 |
| 移动端适配 | BuiltinSimulatorHostView + device 配置 | 内置多设备支持 |
| 特殊设备 | 自定义模拟器 | 灵活定制 |
| 性能优先 | 自定义轻量级模拟器 | 去除不必要的功能 |
| 品牌定制 | 基于 BuiltinSimulatorHostView 扩展 | 保留核心功能，定制外观 |

### 5.2 自定义模拟器注意事项

1. **保持接口兼容**
   - 实现必要的方法和属性
   - 遵循模拟器协议规范

2. **处理通信机制**
   - 正确处理与设计器的通信
   - 维护状态同步

3. **性能优化**
   - 避免不必要的重渲染
   - 合理使用 shouldComponentUpdate

4. **事件处理**
   - 正确传递和处理设计器事件
   - 处理拖拽、选择等交互

### 5.3 调试技巧

1. **使用 viewName 标识**
   ```typescript
   const { viewName } = designer;
   console.log(`Simulator for view: ${viewName}`);
   ```

2. **监听渲染器就绪**
   ```typescript
   project.onRendererReady(() => {
     console.log('Renderer is ready');
   });
   ```

3. **检查模拟器实例**
   ```typescript
   const simulator = project.simulator;
   console.log('Simulator type:', simulator.constructor.name);
   ```

## 六、总结

Simulator 组件的灵活设计使得低代码引擎能够适应各种不同的使用场景：

1. **默认模拟器**（BuiltinSimulatorHostView）适合大多数场景，提供完整的设计功能
2. **自定义模拟器**为特殊需求提供了扩展能力
3. **统一的接口设计**确保了不同模拟器之间的互换性
4. **分层架构**使得各个功能模块可以独立升级和优化

选择合适的模拟器组件，可以让低代码设计器更好地服务于具体的业务场景。
