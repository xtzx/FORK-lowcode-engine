// React 基础组件：用于构建UI组件
import { Component, Fragment, PureComponent } from 'react';
// CSS 类名合并工具：用于动态组合样式类
import classNames from 'classnames';
// 低代码核心库：computed 用于计算属性，observer 用于 MobX 响应式，Title 用于显示标题
import { computed, observer, Title } from '@alilc/lowcode-editor-core';
// 标题内容的类型定义：可以是字符串、React 元素或标题配置对象
import { IPublicTypeTitleContent } from '@alilc/lowcode-types';
// 节点查找工具：用于向上查找符合条件的父节点
import { getClosestNode } from '@alilc/lowcode-utils';
// 国际化函数：用于多语言支持
import { intl } from '../../locale';
// 内置模拟器宿主：提供模拟器的核心功能和API
import { BuiltinSimulatorHost } from '../host';

/**
 * 检测边框实例组件
 * 负责渲染单个组件的检测边框，显示组件标题和锁定状态
 * 这是一个纯组件，用于性能优化，只有 props 变化时才重新渲染
 */
export class BorderDetectingInstance extends PureComponent<{
  title: IPublicTypeTitleContent; // 组件标题：显示在边框上的组件名称或自定义标题
  rect: DOMRect | null; // 组件的矩形区域：包含位置、宽高等信息，null 表示无效区域
  scale: number; // 画布缩放比例：用于适配不同缩放级别下的边框显示
  scrollX: number; // 水平滚动偏移量：补偿滚动条位置对边框定位的影响
  scrollY: number; // 垂直滚动偏移量：补偿滚动条位置对边框定位的影响
  isLocked?: boolean; // 是否锁定：锁定的组件会显示锁定标识，不可编辑
}> {
  render() {
    // 解构所有传入的属性
    const { title, rect, scale, scrollX, scrollY, isLocked } = this.props;

    // 🎯 边界检查：如果没有有效的矩形区域，则不渲染任何内容
    if (!rect) {
      return null;
    }

    // 📐 计算边框的样式：根据缩放比例和滚动偏移量计算最终位置和尺寸
    const style = {
      // 宽度：原始宽度 × 缩放比例
      width: rect.width * scale,
      // 高度：原始高度 × 缩放比例
      height: rect.height * scale,
      // 位置变换：考虑滚动偏移和缩放，精确定位到目标组件位置
      // (scrollX + rect.left) 是实际的水平位置，再乘以缩放比例
      transform: `translate(${(scrollX + rect.left) * scale}px, ${(scrollY + rect.top) * scale}px)`,
    };

    // 🎨 构造CSS类名：基础边框样式 + 检测状态样式
    const className = classNames('lc-borders lc-borders-detecting');

    // TODO: 未来优化方向
    // 1. 考虑添加图标显示（thinkof icon）
    // 2. 考虑优化标题的上下内边距（thinkof top|bottom|inner space）

    return (
      // 📦 边框容器：应用计算出的样式和类名
      <div className={className} style={style}>
        {/* 📝 组件标题：显示组件名称，使用统一的标题样式 */}
        <Title title={title} className="lc-borders-title" />
        {/* 🔒 锁定状态指示器：只有当组件被锁定时才显示 */}
        {
          isLocked ? (<Title title={intl('locked')} className="lc-borders-status" />) : null
        }
      </div>
    );
  }
}

/**
 * 边框检测主组件
 * 使用 MobX observer 装饰器，实现响应式更新
 * 负责检测当前悬停的组件并渲染相应的检测边框
 * 支持根节点、锁定节点、普通节点、多实例节点等多种情况的处理
 */
@observer
export class BorderDetecting extends Component<{ host: BuiltinSimulatorHost }> {
  /**
   * 画布缩放比例计算属性
   * 使用 @computed 装饰器，只有当 viewport.scale 变化时才重新计算
   * 用于确保边框在不同缩放级别下正确显示
   */
  @computed get scale() {
    return this.props.host.viewport.scale;
  }

  /**
   * 水平滚动偏移量计算属性
   * 用于补偿画布水平滚动对边框位置的影响
   * 确保边框始终跟随目标组件移动
   */
  @computed get scrollX() {
    return this.props.host.viewport.scrollX;
  }

  /**
   * 垂直滚动偏移量计算属性
   * 用于补偿画布垂直滚动对边框位置的影响
   * 确保边框始终跟随目标组件移动
   */
  @computed get scrollY() {
    return this.props.host.viewport.scrollY;
  }

  /**
   * 当前检测节点计算属性
   * 这是核心逻辑，决定要为哪个节点显示检测边框
   * 包含多重验证以确保边框显示的正确性
   */
  @computed get current() {
    const { host } = this.props;
    // 📄 获取当前活跃的文档实例
    const doc = host.currentDocument;
    if (!doc) {
      // 🚫 没有活跃文档时不显示边框
      return null;
    }

    // 🎯 获取当前选中状态和检测状态
    const { selection } = doc; // 当前选中的节点集合
    const { current } = host.designer.detecting; // 当前检测中的节点（鼠标悬停）

    // 📋 多重验证确保边框显示的合理性：
    if (!current || // 1. 必须存在检测节点
        current.document !== doc || // 2. 检测节点必须属于当前文档
        selection.has(current.id)) { // 3. 已选中的节点不显示检测边框（避免重复）
      return null;
    }

    return current;
  }

  /**
   * 渲染方法：根据当前状态和节点类型渲染相应的检测边框
   * 包含复杂的条件判断逻辑，处理各种特殊情况
   */
  render() {
    const { host } = this.props;
    const { current } = this;

    // 🔗 检查组件的悬停钩子（onHoverHook）
    // 有些组件可能自定义了悬停行为，需要通过钩子函数确认是否允许悬停
    const canHoverHook = current?.componentMeta.advanced.callbacks?.onHoverHook;
    const canHover = (canHoverHook && typeof canHoverHook === 'function')
      ? canHoverHook((current as any).internalToShellNode()) // 调用自定义钩子检查
      : true; // 默认允许悬停

    // 🚫 多重条件检查，任一条件不满足都不渲染边框：
    if (!canHover || // 1. 组件不允许悬停
        !current || // 2. 没有当前检测节点
        host.viewport.scrolling || // 3. 画布正在滚动中（避免渲染问题）
        host.liveEditing.editing) { // 4. 正在实时编辑模式（避免干扰编辑）
      return null;
    }

    // 🎯 获取焦点节点：当前文档中用户关注的主要区域
    // rootNode case: hover whole viewport（根节点情况：悬停整个视口）
    const focusNode = current.document!.focusNode!;

    // 📍 检查当前节点是否在焦点节点的范围内
    // 如果不在范围内，说明节点不在当前可视区域，不需要显示边框
    if (!focusNode.contains(current)) {
      return null;
    }

    // 🌟 特殊情况1：根节点处理
    // 当前检测的节点包含焦点节点时，说明悬停的是根节点或顶级容器
    // 此时需要显示全视口的检测边框，而不是节点本身的边框
    if (current.contains(focusNode)) {
      const { bounds } = host.viewport;
      return (
        <BorderDetectingInstance
          key="line-root" // 唯一key，标识这是根节点边框
          title={current.title} // 显示根节点标题
          scale={this.scale} // 应用当前缩放比例
          scrollX={host.viewport.scrollX} // 水平滚动偏移
          scrollY={host.viewport.scrollY} // 垂直滚动偏移
          rect={new DOMRect(0, 0, bounds.width, bounds.height)} // 创建覆盖整个视口的矩形
        />
      );
    }

    // 🔒 特殊情况2：锁定节点处理
    // 查找当前节点或其父级节点中是否有锁定的节点
    const lockedNode = getClosestNode(current as any, (n) => {
      // 🎯 锁定检查逻辑：
      // 如果当前节点本身就是锁定状态，则从父节点开始查找更上级的锁定节点
      // 如果当前节点不是锁定状态，则检查节点自身是否锁定
      return !!(current?.isLocked ? n.parent?.isLocked : n.isLocked);
    });

    // 🔐 如果找到锁定节点且不是当前节点本身，则显示锁定节点的边框
    if (lockedNode && (lockedNode as any).getId() !== (current as any).getId()) {
      // 显示被锁定的父节点边框，而不是当前悬停节点的边框
      // 这样用户可以清楚地知道哪个父级组件被锁定了
      const lockedInstances = host.getComponentInstances(lockedNode);
      if (lockedInstances && lockedInstances.length > 0) {
        return (
          <BorderDetectingInstance
            key="line-h" // 标识这是悬停边框
            title={current.title} // 显示当前节点标题
            scale={this.scale} // 应用缩放比例
            scrollX={this.scrollX} // 水平滚动偏移
            scrollY={this.scrollY} // 垂直滚动偏移
            // 计算锁定节点的矩形区域：获取锁定节点的第一个实例，使用其根选择器计算位置
            rect={host.computeComponentInstanceRect(
              lockedInstances[0],
              lockedNode.componentMeta.rootSelector,
            )}
            isLocked={(lockedNode as any).getId() !== (current as any).getId()} // 标记为锁定状态
          />
        );
      }
    }

    // 📦 普通情况：获取当前节点的组件实例
    // 一个逻辑节点可能对应多个DOM实例（例如在循环渲染中）
    const instances = host.getComponentInstances(current);
    if (!instances || instances.length < 1) {
      // 🚫 没有有效实例时不渲染边框
      return null;
    }

    // ✨ 情况3：单实例节点处理（最常见情况）
    if (instances.length === 1) {
      return (
        <BorderDetectingInstance
          key="line-h" // 标识这是悬停边框
          title={current.title} // 显示节点标题
          scale={this.scale} // 应用缩放比例
          scrollX={this.scrollX} // 水平滚动偏移
          scrollY={this.scrollY} // 垂直滚动偏移
          // 🎯 计算单个实例的矩形区域：使用组件的根选择器获取准确位置
          rect={host.computeComponentInstanceRect(instances[0], current.componentMeta.rootSelector)}
        />
      );
    }

    // 🔄 情况4：多实例节点处理（循环渲染等情况）
    // 为每个实例都渲染一个检测边框，让用户能清楚看到所有实例的位置
    return (
      <Fragment>
        {instances.map((inst, i) => (
          <BorderDetectingInstance
            // eslint-disable-next-line react/no-array-index-key
            key={`line-h-${i}`} // 为每个实例生成唯一key（在这里使用索引是合理的）
            title={current.title} // 所有实例显示相同标题
            scale={this.scale} // 应用缩放比例
            scrollX={this.scrollX} // 水平滚动偏移
            scrollY={this.scrollY} // 垂直滚动偏移
            // 🎯 分别计算每个实例的矩形区域
            rect={host.computeComponentInstanceRect(inst, current.componentMeta.rootSelector)}
          />
        ))}
      </Fragment>
    );
  }
}
