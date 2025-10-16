/**
 * @file Tree 树视图组件
 * @description 大纲树的主视图组件，处理树的交互事件和渲染
 *
 * 核心功能：
 * 1. 渲染树结构（从根节点开始）
 * 2. 处理鼠标事件（点击、双击、悬停、拖拽）
 * 3. 管理选中状态（单选、多选）
 * 4. 触发拖拽（boost）
 * 5. 监听根节点变化
 *
 * 事件处理：
 * - onClick: 单击选中节点
 * - onDoubleClick: 双击展开/折叠所有后代
 * - onMouseDown: 鼠标按下开始拖拽
 * - onMouseOver: 鼠标悬停检测
 * - onMouseLeave: 鼠标离开取消检测
 *
 * 拖拽流程：
 * ```
 * 1. onMouseDown: 鼠标按下
 * 2. 判断是否可拖拽
 * 3. canvas.dragon.boost(): 启动拖拽
 * 4. 进入拖拽模式
 * 5. onMouseMove: 拖拽中（由 dragon 处理）
 * 6. onMouseUp: 结束拖拽
 * ```
 *
 * 性能优化：
 * - 使用 PureComponent 避免不必要的渲染
 * - 使用 onMouseDownCapture 提前捕获
 * - 事件委托（在根元素监听）
 *
 * @example
 * ```tsx
 * <TreeView tree={tree} />
 * ```
 */

import { MouseEvent as ReactMouseEvent, PureComponent } from 'react';
import { isFormEvent, canClickNode, isShaken } from '@alilc/lowcode-utils';  // 工具函数
import { Tree } from '../controllers/tree';  // 树模型
import TreeNodeView from './tree-node';  // 树节点视图
import { IPublicEnumDragObjectType, IPublicModelNode } from '@alilc/lowcode-types';
import TreeNode from '../controllers/tree-node';  // 树节点模型

// ==================== 辅助函数：从事件获取树节点ID ====================
/**
 * 从鼠标事件中提取树节点 ID
 *
 * @param e - React 鼠标事件
 * @param stop - 停止搜索的边界元素
 * @returns 节点 ID 或 null
 *
 * 功能：
 * - 从事件目标元素向上查找
 * - 找到带有 data-id 属性的元素
 * - 返回该元素的 data-id
 *
 * 查找策略：
 * 1. 获取事件目标元素（e.target）
 * 2. 检查是否在容器内（stop.contains）
 * 3. 使用 closest 向上查找 [data-id]
 * 4. 再次检查是否在容器内
 * 5. 提取 dataset.id
 *
 * 为什么要检查 stop.contains？
 * - 防止事件冒泡到外部元素
 * - 确保只处理树内部的点击
 *
 * closest('[data-id]') 的作用：
 * - 从当前元素向上查找
 * - 找到第一个匹配选择器的祖先
 * - 类似 jQuery 的 closest()
 *
 * 使用场景：
 * ```tsx
 * // HTML 结构：
 * <div data-id="node-1">
 *   <span>Button</span>
 *   <i>icon</i>  <- 用户点击这里
 * </div>
 *
 * // 从 <i> 向上查找到 <div data-id="node-1">
 * // 返回 "node-1"
 * ```
 *
 * @example
 * ```typescript
 * const nodeId = getTreeNodeIdByEvent(e, treeContainer);
 * if (nodeId) {
 *   const treeNode = tree.getTreeNodeById(nodeId);
 *   treeNode.select();
 * }
 * ```
 */
function getTreeNodeIdByEvent(e: ReactMouseEvent, stop: Element): null | string {
  // 获取事件目标元素
  let target: Element | null = e.target as Element;

  // 检查目标是否在容器内
  if (!target || !stop.contains(target)) {
    return null;
  }

  // 向上查找带有 data-id 的元素
  target = target.closest('[data-id]');

  // 再次检查是否在容器内（防止查找到外部元素）
  if (!target || !stop.contains(target)) {
    return null;
  }

  // 返回 data-id 属性值
  return (target as HTMLDivElement).dataset.id || null;
}

// ==================== TreeView 组件类 ====================
/**
 * 树视图组件类
 *
 * Props:
 * - tree: 树模型实例
 *
 * State:
 * - root: 根树节点
 *
 * 使用 PureComponent 的原因：
 * - 树可能很大，渲染开销大
 * - 只在 tree 变化时重新渲染
 * - 性能优化
 */
export default class TreeView extends PureComponent<{
  tree: Tree;  // 树模型
}> {
  // ========== 私有属性：DOM 引用 ==========
  /**
   * 树容器的 DOM 元素引用
   *
   * 用途：
   * - 事件处理中查找节点
   * - 作为 closest 查找的边界
   * - 滚动控制
   */
  private shell: HTMLDivElement | null = null;

  // ========== 私有属性：忽略 mouseup 选中 ==========
  /**
   * 标志是否忽略 mouseup 时的选中操作
   *
   * 用途：
   * - 多选模式下，mousedown 已经处理了选中
   * - mouseup 时不再重复选中
   * - 避免选中逻辑冲突
   *
   * 场景：
   * ```
   * 用户 Ctrl+点击节点：
   * 1. mousedown: 添加到选中列表
   * 2. 设置 ignoreUpSelected = true
   * 3. mouseup(onClick): 检查标志，忽略处理
   * ```
   */
  private ignoreUpSelected = false;

  // ========== 私有属性：拖拽启动事件 ==========
  /**
   * 记录启动拖拽的原始鼠标事件
   *
   * 用途：
   * - 传递给 dragon.boost()
   * - 检测是否抖动（isShaken）
   * - 区分点击和拖拽
   *
   * 抖动检测：
   * - 鼠标按下和松开位置很近 -> 点击
   * - 鼠标按下和松开位置很远 -> 拖拽
   * - isShaken() 判断距离
   */
  private boostEvent?: MouseEvent;

  // ========== 组件状态 ==========
  /**
   * 组件状态
   *
   * root: 树的根节点
   * - 初始为 null
   * - componentDidMount 时设置
   * - 根节点变化时更新
   */
  state: {
    root: TreeNode | null;
  } = {
    root: null,
  };

  // ========== 私有方法：悬停处理 ==========
  /**
   * 处理鼠标悬停
   *
   * @param e - React 鼠标事件
   *
   * 功能：
   * - 获取悬停的节点
   * - 触发检测系统（detecting）
   * - 实现节点高亮
   *
   * 检测系统（detecting）：
   * - 鼠标悬停时高亮节点
   * - 用于快速定位节点
   * - 不同于选中（selection）
   *
   * 为什么要检查 enable？
   * - 检测功能可能被禁用
   * - 某些情况下不需要检测（如拖拽中）
   *
   * 使用场景：
   * ```
   * 用户鼠标移动到节点上：
   * 1. hover() 触发
   * 2. detecting.capture(nodeId)
   * 3. 节点添加高亮样式
   * 4. 画布上对应组件也高亮
   * ```
   */
  private hover(e: ReactMouseEvent) {
    const { project } = this.props.tree.pluginContext;
    const detecting = project.currentDocument?.detecting;

    // 检测功能已启用，不处理（避免冲突）
    if (detecting?.enable) {
      return;
    }

    // 获取悬停的节点
    const node = this.getTreeNodeFromEvent(e)?.node;

    // 捕获节点到检测系统
    node?.id && detecting?.capture(node.id);
  }

  private onClick = (e: ReactMouseEvent) => {
    if (this.ignoreUpSelected) {
      this.boostEvent = undefined;
      return;
    }
    if (this.boostEvent && isShaken(this.boostEvent, e.nativeEvent)) {
      this.boostEvent = undefined;
      return;
    }
    this.boostEvent = undefined;
    const treeNode = this.getTreeNodeFromEvent(e);
    if (!treeNode) {
      return;
    }
    const { node } = treeNode;

    if (!canClickNode(node, e)) {
      return;
    }

    const { project, event, canvas } = this.props.tree.pluginContext;
    const doc = project.currentDocument;
    const selection = doc?.selection;
    const focusNode = doc?.focusNode;
    const { id } = node;
    const isMulti = e.metaKey || e.ctrlKey || e.shiftKey;
    canvas.activeTracker?.track(node);
    if (isMulti && focusNode && !node.contains(focusNode) && selection?.has(id)) {
      if (!isFormEvent(e.nativeEvent)) {
        selection.remove(id);
      }
    } else {
      selection?.select(id);
      const selectedNode = selection?.getNodes()?.[0];
      const npm = selectedNode?.componentMeta?.npm;
      const selected =
        [npm?.package, npm?.componentName].filter((item) => !!item).join('-') ||
        selectedNode?.componentMeta?.componentName ||
        '';
      event.emit('outlinePane.select', {
        selected,
      });
    }
  };

  private onDoubleClick = (e: ReactMouseEvent) => {
    e.preventDefault();
    const treeNode = this.getTreeNodeFromEvent(e);
    if (treeNode?.nodeId === this.state.root?.nodeId) {
      return;
    }
    if (!treeNode?.expanded) {
      this.props.tree.expandAllDecendants(treeNode);
    } else {
      this.props.tree.collapseAllDecendants(treeNode);
    }
  };

  private onMouseOver = (e: ReactMouseEvent) => {
    this.hover(e);
  };

  private getTreeNodeFromEvent(e: ReactMouseEvent) {
    if (!this.shell) {
      return;
    }
    const id = getTreeNodeIdByEvent(e, this.shell);
    if (!id) {
      return;
    }

    const { tree } = this.props;
    return tree.getTreeNodeById(id);
  }

  private onMouseDown = (e: ReactMouseEvent) => {
    if (isFormEvent(e.nativeEvent)) {
      return;
    }
    const treeNode = this.getTreeNodeFromEvent(e);
    if (!treeNode) {
      return;
    }

    const { node } = treeNode;

    if (!canClickNode(node, e)) {
      return;
    }
    const { project, canvas } = this.props.tree.pluginContext;
    const selection = project.currentDocument?.selection;
    const focusNode = project.currentDocument?.focusNode;

    // TODO: shift selection
    const isMulti = e.metaKey || e.ctrlKey || e.shiftKey;
    const isLeftButton = e.button === 0;

    if (isLeftButton && focusNode && !node.contains(focusNode)) {
      let nodes: IPublicModelNode[] = [node];
      this.ignoreUpSelected = false;
      if (isMulti) {
        // multi select mode, directily add
        if (!selection?.has(node.id)) {
          canvas.activeTracker?.track(node);
          selection?.add(node.id);
          this.ignoreUpSelected = true;
        }
        // todo: remove rootNodes id
        selection?.remove(focusNode.id);
        // 获得顶层 nodes
        if (selection) {
          nodes = selection.getTopNodes();
        }
      } else if (selection?.has(node.id)) {
        nodes = selection.getTopNodes();
      }
      this.boostEvent = e.nativeEvent;
      canvas.dragon?.boost(
        {
          type: IPublicEnumDragObjectType.Node,
          nodes,
        },
        this.boostEvent,
      );
    }
  };

  private onMouseLeave = () => {
    const { pluginContext } = this.props.tree;
    const { project } = pluginContext;
    const doc = project.currentDocument;
    doc?.detecting.leave();
  };

  componentDidMount() {
    const { tree } = this.props;
    const { root } = tree;
    const { project } = tree.pluginContext;
    this.setState({ root });
    const doc = project.currentDocument;
    doc?.onFocusNodeChanged(() => {
      this.setState({
        root: tree.root,
      });
    });
    doc?.onImportSchema(() => {
      this.setState({
        root: tree.root,
      });
    });
  }

  render() {
    if (!this.state.root) {
      return null;
    }
    return (
      <div
        className="lc-outline-tree"
        ref={(shell) => { this.shell = shell; }}
        onMouseDownCapture={this.onMouseDown}
        onMouseOver={this.onMouseOver}
        onClick={this.onClick}
        onDoubleClick={this.onDoubleClick}
        onMouseLeave={this.onMouseLeave}
      >
        <TreeNodeView
          key={this.state.root?.id}
          treeNode={this.state.root}
          isRootNode
        />
      </div>
    );
  }
}
