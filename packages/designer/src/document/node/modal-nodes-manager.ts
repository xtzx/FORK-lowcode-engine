/**
 * @file ModalNodesManager 模态框节点管理器
 * @description 管理文档中所有的模态框节点（Dialog、Drawer 等）
 *
 * 核心功能：
 * 1. 模态框收集：递归收集所有 isModal 为 true 的节点
 * 2. 可见性管理：控制哪个模态框可见（同时只能有一个）
 * 3. 事件通知：节点增删、可见性变化时发送事件
 * 4. 自动管理：监听节点的创建和销毁，自动维护列表
 *
 * 什么是 Modal 节点？
 * - 组件元数据中 `isModal: true` 的节点
 * - 通常是 Dialog、Drawer、Popover 等弹出层组件
 * - 这些组件需要特殊的显示控制
 *
 * 为什么需要特殊管理？
 * ```
 * 1. 默认隐藏：设计时模态框应该隐藏，避免遮挡画布
 * 2. 独立显示：可以单独打开某个模态框进行编辑
 * 3. 互斥显示：同时只能显示一个模态框
 * 4. 跨层级：模态框可能在任何层级，需要统一管理
 * ```
 *
 * 工作流程：
 * ```
 * 1. 初始化：递归遍历 rootNode，收集所有 Modal 节点
 * 2. 隐藏所有：默认将所有 Modal 节点设置为不可见
 * 3. 监听变化：监听节点创建/销毁事件，自动更新列表
 * 4. 可见性控制：用户点击时，隐藏其他，显示选中的
 * ```
 *
 * 使用场景：
 * - 大纲树：显示所有 Modal 节点的列表
 * - 属性面板：切换编辑不同的 Modal
 * - 画布预览：控制哪个 Modal 显示
 *
 * @example
 * ```typescript
 * // 创建管理器
 * const manager = new ModalNodesManager(document);
 *
 * // 获取所有 Modal 节点
 * const modals = manager.getModalNodes();
 *
 * // 显示某个 Modal
 * manager.setVisible(dialogNode);
 *
 * // 监听可见性变化
 * manager.onVisibleChange(() => {
 *   console.log('当前显示的 Modal:', manager.getVisibleModalNode());
 * });
 * ```
 */

import { INode } from './node';
import { DocumentModel } from '../document-model';
import { IPublicModelModalNodesManager } from '@alilc/lowcode-types';
import { createModuleEventBus, IEventBus } from '@alilc/lowcode-editor-core';

// ==================== 辅助函数：递归收集 Modal 节点 ====================
/**
 * 递归获取节点树中的所有 Modal 节点
 *
 * @param node - 根节点
 * @returns Modal 节点数组
 *
 * 实现：
 * 1. 检查当前节点是否是 Modal
 * 2. 递归检查所有子节点
 * 3. 合并结果
 *
 * 为什么递归？
 * - Modal 节点可能在任何层级
 * - 需要遍历整棵树
 *
 * @example
 * ```typescript
 * // 树结构：
 * Page
 *   ├─ Container
 *   │   └─ Dialog (Modal)
 *   └─ Drawer (Modal)
 *
 * getModalNodes(page)  // [Dialog, Drawer]
 * ```
 */
export function getModalNodes(node: INode) {
  if (!node) return [];

  let nodes: any = [];

  // 检查当前节点
  if (node.componentMeta.isModal) {
    nodes.push(node);
  }

  // 递归检查子节点
  const { children } = node;
  if (children) {
    children.forEach((child) => {
      nodes = nodes.concat(getModalNodes(child));
    });
  }

  return nodes;
}

// ==================== IModalNodesManager 接口 ====================
/**
 * 模态框节点管理器接口
 *
 * 继承：IPublicModelModalNodesManager
 */
export interface IModalNodesManager extends IPublicModelModalNodesManager<INode> {
}

// ==================== ModalNodesManager 类 ====================
/**
 * 模态框节点管理器类
 *
 * 职责：
 * - 维护 Modal 节点列表（modalNodes）
 * - 监听节点创建/销毁事件（nodeRemoveEvents）
 * - 控制可见性（setVisible/setInvisible）
 * - 发送变化事件（emitter）
 *
 * 核心数据：
 * ```typescript
 * {
 *   page: DocumentModel,           // 所属文档
 *   modalNodes: [dialog, drawer],  // 所有 Modal 节点
 *   nodeRemoveEvents: {            // 节点事件清理函数
 *     'node-1': dispose,
 *     'node-2': dispose
 *   },
 *   emitter: EventBus              // 事件总线
 * }
 * ```
 */
export class ModalNodesManager implements IModalNodesManager {
  willDestroy: any;

  private page: DocumentModel;

  private modalNodes: INode[];

  private nodeRemoveEvents: any;

  private emitter: IEventBus;

  constructor(page: DocumentModel) {
    this.page = page;
    this.emitter = createModuleEventBus('ModalNodesManager');
    this.nodeRemoveEvents = {};
    this.setNodes();
    this.hideModalNodes();
    this.willDestroy = [
      page.onNodeCreate((node) => this.addNode(node)),
      page.onNodeDestroy((node) => this.removeNode(node)),
    ];
  }

  getModalNodes(): INode[] {
    return this.modalNodes;
  }

  getVisibleModalNode(): INode | null {
    const visibleNode = this.getModalNodes().find((node: INode) => node.getVisible());
    return visibleNode || null;
  }

  hideModalNodes() {
    this.modalNodes.forEach((node: INode) => {
      node.setVisible(false);
    });
  }

  setVisible(node: INode) {
    this.hideModalNodes();
    node.setVisible(true);
  }

  setInvisible(node: INode) {
    node.setVisible(false);
  }

  onVisibleChange(func: () => any) {
    this.emitter.on('visibleChange', func);
    return () => {
      this.emitter.removeListener('visibleChange', func);
    };
  }

  onModalNodesChange(func: () => any) {
    this.emitter.on('modalNodesChange', func);
    return () => {
      this.emitter.removeListener('modalNodesChange', func);
    };
  }

  private addNode(node: INode) {
    if (node?.componentMeta.isModal) {
      this.hideModalNodes();
      this.modalNodes.push(node);
      this.addNodeEvent(node);
      this.emitter.emit('modalNodesChange');
      this.emitter.emit('visibleChange');
    }
  }

  private removeNode(node: INode) {
    if (node.componentMeta.isModal) {
      const index = this.modalNodes.indexOf(node);
      if (index >= 0) {
        this.modalNodes.splice(index, 1);
      }
      this.removeNodeEvent(node);
      this.emitter.emit('modalNodesChange');
      if (node.getVisible()) {
        this.emitter.emit('visibleChange');
      }
    }
  }

  private addNodeEvent(node: INode) {
    this.nodeRemoveEvents[node.id] =
      node.onVisibleChange(() => {
        this.emitter.emit('visibleChange');
      });
  }

  private removeNodeEvent(node: INode) {
    if (this.nodeRemoveEvents[node.id]) {
      this.nodeRemoveEvents[node.id]();
      delete this.nodeRemoveEvents[node.id];
    }
  }

  setNodes() {
    const nodes = getModalNodes(this.page.rootNode!);
    this.modalNodes = nodes;
    this.modalNodes.forEach((node: INode) => {
      this.addNodeEvent(node);
    });

    this.emitter.emit('modalNodesChange');
  }
}
