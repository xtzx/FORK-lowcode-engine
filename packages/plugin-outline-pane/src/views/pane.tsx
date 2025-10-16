/**
 * @file Pane 面板视图组件
 * @description 大纲树面板的主容器组件，整合过滤器和树视图
 *
 * 核心功能：
 * 1. 监听文档切换，更新树实例
 * 2. 显示加载状态（树未就绪时）
 * 3. 整合过滤器组件（可选）
 * 4. 渲染树视图
 * 5. 挂载面板控制器到 DOM
 *
 * 组件结构：
 * ```
 * Pane
 * ├── Filter（过滤器，可选）
 * └── TreeView（树视图）
 * ```
 *
 * 生命周期管理：
 * - 监听 3 个文档事件
 * - 组件卸载时清理所有监听
 * - 避免内存泄漏
 *
 * 为什么使用 PureComponent？
 * - 自动实现浅比较的 shouldComponentUpdate
 * - props 未变化时不重新渲染
 * - 性能优化
 *
 * @example
 * ```tsx
 * <Pane
 *   treeMaster={treeMaster}
 *   controller={paneController}
 *   hideFilter={false}
 * />
 * ```
 */

import React, { PureComponent } from 'react';
import { Loading } from '@alifd/next';  // 加载组件
import { PaneController } from '../controllers/pane-controller';  // 面板控制器
import TreeView from './tree';  // 树视图组件
import './style.less';  // 样式文件
import Filter from './filter';  // 过滤器组件
import { TreeMaster } from '../controllers/tree-master';  // 树主控制器
import { Tree } from '../controllers/tree';  // 树模型
import { IPublicTypeDisposable } from '@alilc/lowcode-types';  // 可清理对象类型

// ==================== Pane 组件 ====================
/**
 * 面板主组件类
 *
 * Props:
 * - treeMaster: 树主控制器
 * - controller: 面板控制器
 * - hideFilter: 是否隐藏过滤器（可选）
 *
 * State:
 * - tree: 当前文档的树实例
 *
 * 使用 PureComponent 的原因：
 * - 自动浅比较优化
 * - 只在 props 或 state 真正变化时重新渲染
 */
export class Pane extends PureComponent<{
  treeMaster: TreeMaster;  // 树主控制器
  controller: PaneController;  // 面板控制器
  hideFilter?: boolean;  // 是否隐藏过滤器
}, {
  tree: Tree | null;  // 当前树实例
}> {
  // ========== 私有属性 ==========

  /**
   * 面板控制器引用
   *
   * 用途：
   * - 挂载到 DOM（mount）
   * - 清理资源（purge）
   */
  private controller;

  /**
   * 模拟器渲染就绪事件清理函数
   *
   * 用途：
   * - 监听模拟器渲染就绪
   * - 组件卸载时清理
   */
  private simulatorRendererReadyDispose: IPublicTypeDisposable;

  /**
   * 文档切换事件清理函数
   *
   * 用途：
   * - 监听文档切换
   * - 组件卸载时清理
   */
  private changeDocumentDispose: IPublicTypeDisposable;

  /**
   * 文档移除事件清理函数
   *
   * 用途：
   * - 监听文档删除
   * - 组件卸载时清理
   */
  private removeDocumentDispose: IPublicTypeDisposable;

  // ========== 构造函数 ==========
  /**
   * 构造面板组件
   *
   * @param props - 组件属性
   *
   * 初始化流程：
   * 1. 保存 controller 引用
   * 2. 初始化 state（当前树）
   * 3. 监听 3 个文档事件
   *
   * 监听的事件：
   * - onSimulatorRendererReady: 模拟器渲染就绪
   * - onChangeDocument: 文档切换
   * - onRemoveDocument: 文档移除
   *
   * 为什么要监听这些事件？
   * - 文档切换时需要切换树
   * - 模拟器就绪时树才能正常工作
   * - 文档移除时需要更新状态
   */
  constructor(props: any) {
    super(props);

    // 解构 props
    const { controller, treeMaster } = props;

    // 保存 controller 引用
    this.controller = controller;

    // 初始化 state
    this.state = {
      tree: treeMaster.currentTree,  // 获取当前树
    };

    // ===== 监听事件1：模拟器渲染就绪 =====
    // 模拟器（iframe）渲染完成后，树才能正常工作
    this.simulatorRendererReadyDispose = this.props.treeMaster.pluginContext?.project?.onSimulatorRendererReady(this.changeTree);

    // ===== 监听事件2：文档切换 =====
    // 用户切换到不同页面时，切换对应的树
    this.changeDocumentDispose = this.props.treeMaster.pluginContext?.project?.onChangeDocument(this.changeTree);

    // ===== 监听事件3：文档移除 =====
    // 用户删除页面时，更新树状态
    this.removeDocumentDispose = this.props.treeMaster.pluginContext?.project?.onRemoveDocument(this.changeTree);
  }

  // ========== 事件处理：切换树 ==========
  /**
   * 切换树实例
   *
   * 功能：
   * - 从 treeMaster 获取当前文档的树
   * - 更新 state.tree
   * - 触发组件重新渲染
   *
   * 调用时机：
   * - 文档切换
   * - 文档移除
   * - 模拟器就绪
   *
   * 使用箭头函数的原因：
   * - 自动绑定 this
   * - 可以直接作为回调传递
   * - 无需手动 bind
   */
  changeTree = () => {
    this.setState({
      tree: this.props.treeMaster.currentTree,
    });
  };

  // ========== 生命周期：组件卸载 ==========
  /**
   * 组件卸载时的清理
   *
   * 功能：
   * - 清理面板控制器
   * - 取消所有事件监听
   * - 释放资源
   *
   * 为什么必须清理？
   * - 避免内存泄漏
   * - 避免事件监听器累积
   * - 释放 DOM 引用
   *
   * 清理顺序：
   * 1. controller.purge()：清理控制器
   * 2. 清理事件监听
   */
  componentWillUnmount() {
    // 清理控制器
    this.controller.purge();

    // 清理事件监听（使用可选链，防止 undefined）
    this.simulatorRendererReadyDispose?.();
    this.changeDocumentDispose?.();
    this.removeDocumentDispose?.();
  }

  // ========== 渲染方法 ==========
  /**
   * 渲染面板内容
   *
   * 渲染分支：
   * 1. 树未就绪：显示加载状态
   * 2. 树已就绪：显示过滤器和树视图
   *
   * 组件结构：
   * ```
   * <div className="lc-outline-pane">
   *   <Filter />  // 可选
   *   <div className="lc-outline-tree-container">
   *     <TreeView />
   *   </div>
   * </div>
   * ```
   */
  render() {
    // 获取当前树
    const tree = this.state.tree;

    // ===== 情况1：树未就绪 =====
    // 显示加载状态
    if (!tree) {
      return (
        <div className="lc-outline-pane">
          <p className="lc-outline-notice">
            {/* Fusion Loading 组件 */}
            <Loading
              style={{
                display: 'block',
                marginTop: '40px',
              }}
              tip={this.props.treeMaster.pluginContext.intl('Initializing')}  // 国际化文案："初始化中"
            />
          </p>
        </div>
      );
    }

    // ===== 情况2：树已就绪 =====
    return (
      <div className="lc-outline-pane">
        {/* 过滤器（可选） */}
        { !this.props.hideFilter && <Filter tree={tree} /> }

        {/* 树容器 */}
        {/*
          ref={(shell) => this.controller.mount(shell)}:
          - 将 DOM 元素传递给 controller
          - controller 需要 DOM 来计算位置、滚动等
          - mount 方法会保存 DOM 引用
        */}
        <div
          ref={(shell) => this.controller.mount(shell)}
          className={`lc-outline-tree-container ${ this.props.hideFilter ? 'lc-hidden-outline-filter' : '' }`}
        >
          {/* 树视图 */}
          {/*
            key={tree.id}:
            - 使用 tree.id 作为 key
            - 文档切换时 key 变化
            - React 会卸载旧组件，挂载新组件
            - 重置所有内部状态
          */}
          <TreeView key={tree.id} tree={tree} />
        </div>
      </div>
    );
  }
}
