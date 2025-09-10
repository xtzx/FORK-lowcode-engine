// React 核心依赖导入
import {
  Component, // React 组件基类
  Fragment, // React Fragment 组件，用于避免额外 DOM 包裹
  ReactNodeArray, // React 节点数组类型定义
  isValidElement, // 判断是否为有效 React 元素的工具函数
  cloneElement, // 克隆 React 元素并修改其 props
  createElement, // 创建 React 元素的工厂函数
  ReactNode, // React 节点类型定义（元素、文本、数字等）
  ComponentType, // React 组件类型定义
} from 'react';
import classNames from 'classnames'; // 用于条件性拼接 CSS 类名的工具库
import { observer, computed, Tip, engineConfig } from '@alilc/lowcode-editor-core'; // 低代码引擎核心模块
import { createIcon, isReactComponent, isActionContentObject } from '@alilc/lowcode-utils'; // 低代码引擎工具函数
import { IPublicTypeActionContentObject } from '@alilc/lowcode-types'; // 动作内容对象的类型定义
import { BuiltinSimulatorHost } from '../host'; // 内置模拟器宿主类
import { INode, OffsetObserver } from '../../designer'; // 节点接口和偏移观察者类
import NodeSelector from '../node-selector'; // 节点选择器组件
import { ISimulatorHost } from '../../simulator'; // 模拟器宿主接口

// ========================================
// 🎯 选中边框实例组件
// ========================================
// 负责渲染单个组件的选中边框和工具栏
// 使用 MobX observer 装饰器实现响应式更新

@observer // MobX 响应式组件装饰器：自动响应 observed 对象的变化
export class BorderSelectingInstance extends Component<{
  observed: OffsetObserver; // 偏移观察者：提供组件的位置、尺寸等信息
  highlight?: boolean; // 是否高亮显示：用于区分不同的选中状态
  dragging?: boolean; // 是否处于拖拽状态：拖拽时会隐藏工具栏
}> {
  // 组件卸载生命周期：清理偏移观察者的资源
  componentWillUnmount() {
    this.props.observed.purge(); // 清除观察者的缓存和事件监听，防止内存泄漏
  }

  // 渲染选中边框的核心方法
  render() {
    // 解构获取组件属性
    const { observed, highlight, dragging } = this.props;
    // 📏 前置检查：如果观察者没有有效的偏移数据，不渲染任何内容
    if (!observed.hasOffset) {
      return null; // 组件可能还未挂载或位置计算失败
    }

    // 📐 获取组件的精确位置和尺寸信息
    const { offsetWidth, offsetHeight, offsetTop, offsetLeft } = observed;

    // 🎨 构建边框的动态样式
    const style = {
      width: offsetWidth, // 边框宽度：与目标组件保持一致
      height: offsetHeight, // 边框高度：与目标组件保持一致
      transform: `translate3d(${offsetLeft}px, ${offsetTop}px, 0)`, // 3D 变换定位：硬件加速，性能更好
    };

    // 🏷️ 动态构建 CSS 类名
    const className = classNames('lc-borders lc-borders-selecting', {
      highlight, // 高亮状态：添加特殊样式区分不同选中级别
      dragging, // 拖拽状态：通常会改变边框的视觉效果
    });

    // 🚫 检查组件元数据的工具栏显示配置
    const { hideSelectTools } = observed.node.componentMeta.advanced;
    // 🌐 检查全局引擎配置的组件动作显示开关
    const hideComponentAction = engineConfig.get('hideComponentAction');

    // 🚫 如果组件配置隐藏选择工具，不渲染边框
    if (hideSelectTools) {
      return null; // 遵循组件元数据的配置，提供灵活的显示控制
    }

    // 🖼️ 渲染最终的边框容器
    return (
      <div
        className={className} // 应用动态构建的样式类
        style={style} // 应用动态计算的位置和尺寸
      >
        {/* 🔧 条件性渲染工具栏：非拖拽状态 && 未禁用组件动作 */}
        {(!dragging && !hideComponentAction) ? <Toolbar observed={observed} /> : null}
      </div>
    );
  }
}

// ========================================
// 🔧 工具栏组件
// ========================================
// 为选中的组件显示操作工具栏（复制、删除、设置等按钮）
// 智能计算工具栏位置，避免超出视口边界

@observer // MobX 响应式组件：自动响应 observed 对象的变化
class Toolbar extends Component<{ observed: OffsetObserver }> {
  render() {
    // 获取偏移观察者实例
    const { observed } = this.props;
    // 获取视口的宽度和高度，用于边界计算
    const { height = 0, width = 0 } = observed.viewport || {};
    // 📏 工具栏布局常量定义
    const BAR_HEIGHT = 20; // 工具栏的固定高度
    const MARGIN = 1; // 工具栏与边框的间距
    const BORDER = 2; // 边框的宽度
    const SPACE_HEIGHT = BAR_HEIGHT + MARGIN + BORDER; // 工具栏所需的总垂直空间
    const SPACE_MINIMUM_WIDTH = 160; // 工具栏的最小宽度需求（经验值）
    // 📍 初始化工具栏样式对象
    let style: any;

    // 🧮 智能计算工具栏的垂直位置（上/下位置策略）
    if (observed.top > SPACE_HEIGHT) {
      // 策略1：组件上方有足够空间 -> 工具栏显示在组件上方
      style = {
        top: -SPACE_HEIGHT, // 负值：相对于组件边框向上偏移
        height: BAR_HEIGHT, // 设置工具栏固定高度
      };
    } else if (observed.bottom + SPACE_HEIGHT < height) {
      // 策略2：组件下方有足够空间 -> 工具栏显示在组件下方
      style = {
        bottom: -SPACE_HEIGHT, // 负值：相对于组件边框向下偏移
        height: BAR_HEIGHT, // 设置工具栏固定高度
      };
    } else {
      // 策略3：上下都没有足够空间 -> 工具栏重叠显示在组件内部
      style = {
        height: BAR_HEIGHT, // 设置工具栏固定高度
        top: Math.max(MARGIN, MARGIN - observed.top), // 确保工具栏不超出视口顶部
      };
    }
    // 🧮 智能计算工具栏的水平位置（左/右位置策略）
    if (SPACE_MINIMUM_WIDTH > observed.left + observed.width) {
      // 策略1：组件宽度不足以容纳工具栏 -> 工具栏显示在组件左侧
      style.left = Math.max(-BORDER, observed.left - width - BORDER); // 确保工具栏不超出视口左侧
    } else {
      // 策略2：组件宽度足够 -> 工具栏显示在组件右侧
      style.right = Math.max(-BORDER, observed.right - width - BORDER); // 确保工具栏不超出视口右侧
      style.justifyContent = 'flex-start'; // 设置内容左对齐
    }

    // 🎯 获取目标节点实例
    const { node } = observed;
    // 📋 初始化操作按钮数组
    const actions: ReactNodeArray = [];

    // 🔄 遍历组件元数据中定义的可用操作
    node.componentMeta.availableActions.forEach((action) => {
      // 解构操作配置项
      const { important = true, condition, content, name } = action;

      // 🚫 特殊处理：JSSlot 组件禁用复制和删除操作
      if (node.isSlot() && (name === 'copy' || name === 'remove')) {
        // FIXME: 这个逻辑可能需要重新评估
        return; // 跳过当前操作，不添加到工具栏
      }

      // ✅ 操作可见性检查：重要操作 && 条件满足
      if (important && (typeof condition === 'function' ? condition(node) !== false : condition !== false)) {
        // 创建操作按钮并添加到数组
        actions.push(createAction(content, name, node));
      }
    });

    // 🖼️ 渲染工具栏容器
    return (
      <div className="lc-borders-actions" style={style}>
        {actions} {/* 渲染所有操作按钮 */}
        <NodeSelector node={node} /> {/* 节点选择器（下拉菜单等） */}
      </div>
    );
  }
}

// ========================================
// 🎬 操作按钮创建工厂函数
// ========================================
// 根据不同类型的内容配置，创建对应的操作按钮
// 支持 React 元素、组件类、操作内容对象三种类型

function createAction(content: ReactNode | ComponentType<any> | IPublicTypeActionContentObject, key: string, node: INode) {
  // 🧩 类型1：已经是有效的 React 元素
  if (isValidElement<{ key: string; node: INode }>(content)) {
    // 克隆元素并注入 key 和 node 属性
    return cloneElement(content, { key, node });
  }

  // 🧩 类型2：React 组件类或函数组件
  if (isReactComponent(content)) {
    // 使用 createElement 创建组件实例，传入 key 和 node 属性
    return createElement(content, { key, node });
  }

  // 🧩 类型3：操作内容对象（包含 action、title、icon 等配置）
  if (isActionContentObject(content)) {
    // 解构操作内容对象的配置项
    const { action, title, icon } = content;

    return (
      <div
        key={key} // React 列表渲染必需的 key
        className="lc-borders-action" // 操作按钮的样式类
        onClick={() => {
          // 🎯 执行操作回调函数
          action && action(node.internalToShellNode()!); // 将内部节点转换为 Shell 节点后传递

          // 📊 收集组件信息用于事件追踪
          const editor = node.document?.designer.editor; // 获取编辑器实例
          const npm = node?.componentMeta?.npm; // 获取组件的 NPM 信息

          // 🏷️ 构建组件标识字符串（用于分析和统计）
          const selected =
            [npm?.package, npm?.componentName].filter((item) => !!item).join('-') || // NPM 包名-组件名
            node?.componentMeta?.componentName || // 或者组件名
            ''; // 兜底空字符串

          // 📡 发送操作事件到事件总线（用于插件监听、统计等）
          editor?.eventBus.emit('designer.border.action', {
            name: key, // 操作名称
            selected, // 被操作的组件标识
          });
        }}
      >
        {/* 🎨 条件性渲染图标 */}
        {icon && createIcon(icon, { key, node: node.internalToShellNode() })}
        {/* 💡 工具提示显示操作标题 */}
        <Tip>{title}</Tip>
      </div>
    );
  }

  // 🚫 不支持的内容类型，返回 null
  return null;
}

// ========================================
// 🎯 单节点边框选择器组件
// ========================================
// 为指定的节点创建选中边框，处理节点的多实例情况
// 使用 MobX computed 优化性能，避免不必要的重新计算

@observer // MobX 响应式组件：自动响应节点和宿主状态变化
export class BorderSelectingForNode extends Component<{ host: ISimulatorHost; node: INode }> {
  // 🏠 获取模拟器宿主实例（便于类内部访问）
  get host(): ISimulatorHost {
    return this.props.host;
  }

  // 🐲 获取当前拖拽状态（决定是否显示工具栏）
  get dragging(): boolean {
    return this.host.designer.dragon.dragging; // 从设计器的拖拽引擎获取状态
  }

  // 📦 获取节点的组件实例列表（computed 缓存计算结果）
  @computed get instances() {
    return this.host.getComponentInstances(this.props.node); // 一个节点可能对应多个 DOM 实例
  }

  // 渲染节点的选中边框
  render() {
    // 获取节点的组件实例列表
    const { instances } = this;
    const { node } = this.props;
    const { designer } = this.host;

    // 🚫 前置检查：如果没有有效的组件实例，不渲染任何内容
    if (!instances || instances.length < 1) {
      return null; // 节点可能还未挂载到 DOM 或已被卸载
    }

    // 🖼️ 为每个组件实例创建对应的选中边框
    return (
      <Fragment key={node.id}>
        {instances.map((instance) => {
          // 🔍 为每个实例创建偏移观察者（跟踪位置和尺寸变化）
          const observed = designer.createOffsetObserver({
            node, // 逻辑节点：Schema 中的节点定义
            instance, // 物理实例：DOM 中的实际组件实例
          });

          // 🚫 如果观察者创建失败，跳过当前实例
          if (!observed) {
            return null; // 实例可能无效或不可观察
          }

          // ✨ 渲染单个边框选择器实例
          return <BorderSelectingInstance key={observed.id} dragging={this.dragging} observed={observed} />;
        })}
      </Fragment>
    );
  }
}

// ========================================
// 🎯 边框选择器主控组件
// ========================================
// 管理所有选中节点的边框显示，根据不同状态智能选择节点
// 处理拖拽、实时编辑等特殊状态的边框显示逻辑

@observer // MobX 响应式组件：自动响应选择状态、拖拽状态等变化
export class BorderSelecting extends Component<{ host: BuiltinSimulatorHost }> {
  // 🏠 获取内置模拟器宿主实例
  get host(): BuiltinSimulatorHost {
    return this.props.host;
  }

  // 🐲 获取当前拖拽状态（影响选中节点的过滤逻辑）
  get dragging(): boolean {
    return this.host.designer.dragon.dragging;
  }

  // 🎯 获取当前需要显示边框的节点列表（computed 优化性能）
  @computed get selecting() {
    // 获取当前活跃文档
    const doc = this.host.currentDocument;

    // 🚫 文档状态检查：无文档、暂停状态、实时编辑模式时不显示边框
    if (!doc || doc.suspensed || this.host.liveEditing.editing) {
      return null;
    }

    // 获取文档的选择管理器
    const { selection } = doc;

    // 🧠 智能节点选择策略：
    // - 拖拽时：只显示顶级节点的边框（避免嵌套混乱）
    // - 正常时：显示所有选中节点的边框（完整选中反馈）
    return this.dragging ? selection.getTopNodes() : selection.getNodes();
  }

  // 渲染所有选中节点的边框
  render() {
    const { selecting } = this;

    // 🚫 前置检查：没有选中节点时不渲染
    if (!selecting || selecting.length < 1) {
      return null;
    }

    // 🖼️ 为每个选中节点创建对应的边框选择器
    return (
      <Fragment>
        {selecting.map((node) => (
          <BorderSelectingForNode key={node.id} host={this.props.host} node={node} />
        ))}
      </Fragment>
    );
  }
}
