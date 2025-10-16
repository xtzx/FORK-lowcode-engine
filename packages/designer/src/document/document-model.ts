/**
 * @file DocumentModel 文档模型类
 * @description 管理单个页面/文档的核心类，是 Node 树的容器和管理者
 *
 * 📌 核心地位：
 * - DocumentModel 是页面的运行时模型
 * - 管理整个页面的节点树
 * - 协调 Node、Selection、History 等模块
 * - 与 Simulator（渲染器）通信
 *
 * 🎯 核心职责：
 * 1. 节点管理：创建、查找、删除节点
 * 2. 树结构：维护根节点和节点映射
 * 3. 选中管理：Selection 对象
 * 4. 历史记录：History 对象（撤销/重做）
 * 5. Schema 转换：import/export
 * 6. 检测系统：detecting（悬停高亮）
 * 7. 拖放位置：dropLocation
 * 8. 模态框管理：ModalNodesManager
 * 9. 事件系统：文档级事件
 * 10. 生命周期：open、close、suspense
 *
 * 🏗️ 架构关系：
 * ```
 * Project（项目）
 * └── DocumentModel（文档）
 *     ├── rootNode: Node（根节点）
 *     ├── nodesMap: Map<id, Node>（节点索引）
 *     ├── selection: Selection（选中管理）
 *     ├── history: History（历史记录）
 *     ├── simulator: ISimulatorHost（模拟器）
 *     ├── modalNodesManager: ModalNodesManager（模态框管理）
 *     └── detecting: Detecting（检测系统）
 * ```
 *
 * 📄 Document vs Node：
 * ```typescript
 * // Document（文档）：
 * - 页面的容器
 * - 管理整棵 Node 树
 * - 提供全局操作
 * - 单例（一个页面一个 Document）
 *
 * // Node（节点）：
 * - 组件的运行时模型
 * - 树中的一个节点
 * - 局部操作
 * - 多实例（一个页面多个 Node）
 * ```
 *
 * 🔄 Document 生命周期：
 * ```
 * 1. 创建：new DocumentModel(project, schema)
 * 2. 打开：document.open()
 * 3. 激活：document.active = true
 * 4. 挂起：document.suspense()
 * 5. 关闭：document.close()
 * 6. 移除：document.remove()
 * ```
 *
 * 💾 Document 与 Schema：
 * ```typescript
 * // Schema（JSON）：
 * {
 *   componentName: 'Page',
 *   fileName: 'index',
 *   children: [...]
 * }
 *
 * // DocumentModel（运行时）：
 * class DocumentModel {
 *   id = 'doc_abc'
 *   fileName = 'index'
 *   rootNode = Node(Page)
 *   nodesMap = Map { 'node_1': Node, 'node_2': Node }
 *   selection = Selection
 *   history = History
 * }
 * ```
 *
 * 🎨 特殊功能：
 * - focusNode: 当前聚焦的节点（通常是根节点）
 * - dropLocation: 拖拽时的目标位置
 * - detecting: 检测悬停节点
 * - modalNodesManager: 管理所有模态框节点
 *
 * 📚 隐藏知识点：
 * 1. nodesMap 索引：所有节点的快速查找（O(1)）
 * 2. willPurgeSpace：待清理节点的临时存储
 * 3. focusNode：区别于 rootNode，可以动态切换
 * 4. suspense：挂起状态，暂停渲染
 * 5. checkNesting：嵌套规则的集中检查
 *
 * @example
 * ```typescript
 * // 创建文档
 * const document = new DocumentModel(project, pageSchema);
 *
 * // 打开文档
 * document.open();
 *
 * // 操作节点
 * const buttonNode = document.createNode({
 *   componentName: 'Button',
 *   props: { type: 'primary' }
 * });
 *
 * document.rootNode.insertChild(buttonNode, 0);
 *
 * // 导出 Schema
 * const schema = document.export(TransformStage.Save);
 * ```
 */

import {
  makeObservable,  // MobX 可观察化
  obx,  // MobX 装饰器
  engineConfig,  // 引擎配置
  action,  // MobX action 装饰器
  runWithGlobalEventOff,  // 关闭全局事件执行
  wrapWithEventSwitch,  // 包装事件开关
  createModuleEventBus,  // 创建模块事件总线
  IEventBus,  // 事件总线接口
} from '@alilc/lowcode-editor-core';
import {
  IPublicTypeNodeData,  // 节点数据类型
  IPublicTypeNodeSchema,  // 节点 Schema 类型
  IPublicTypePageSchema,  // 页面 Schema 类型
  IPublicTypeComponentsMap,  // 组件映射类型
  IPublicTypeDragNodeObject,  // 拖拽节点对象
  IPublicTypeDragNodeDataObject,  // 拖拽节点数据对象
  IPublicModelDocumentModel,  // 文档模型接口
  IPublicEnumTransformStage,  // 转换阶段枚举
  IPublicTypeOnChangeOptions,  // 变化选项
  IPublicTypeDisposable,  // 可清理对象
} from '@alilc/lowcode-types';
import type {
  IPublicTypeRootSchema,  // 根 Schema 类型
} from '@alilc/lowcode-types';
import type {
  IDropLocation,  // 拖放位置接口
} from '@alilc/lowcode-designer';
import {
  uniqueId,  // 生成唯一 ID
  isPlainObject,  // 判断是否是普通对象
  compatStage,  // 兼容 stage 参数
  isJSExpression,  // 判断是否是 JS 表达式
  isDOMText,  // 判断是否是 DOM 文本
  isNodeSchema,  // 判断是否是节点 Schema
  isDragNodeObject,  // 判断是否是拖拽节点对象
  isDragNodeDataObject,  // 判断是否是拖拽节点数据对象
  isNode,  // 判断是否是 Node 实例
} from '@alilc/lowcode-utils';
import { IProject } from '../project';  // 项目接口
import { ISimulatorHost } from '../simulator';  // 模拟器接口
import type { IComponentMeta } from '../component-meta';  // 组件元数据
import { IDesigner, IHistory } from '../designer';  // 设计器、历史记录接口
import { insertChildren, insertChild, IRootNode } from './node/node';  // 节点工具函数
import type { INode } from './node/node';  // 节点接口
import { Selection, ISelection } from './selection';  // 选中管理
import { History } from './history';  // 历史记录
import { IModalNodesManager, ModalNodesManager, Node } from './node';  // 模态框管理、节点类
import { EDITOR_EVENT } from '../types';  // 编辑器事件

// ==================== 类型工具：GetDataType ====================
/**
 * 类型工具：获取数据类型
 *
 * 功能：
 * - 根据泛型参数推断数据类型
 * - 如果 T 未定义，从 NodeType.schema 推断
 * - 否则使用 T
 *
 * 这是高级的 TypeScript 类型推断
 *
 * 使用场景：
 * ```typescript
 * // NodeType 有 schema 属性时：
 * type Data = GetDataType<undefined, { schema: PageSchema }>;
 * // Data = PageSchema
 *
 * // 明确指定 T 时：
 * type Data = GetDataType<CustomSchema, any>;
 * // Data = CustomSchema
 * ```
 */
export type GetDataType<T, NodeType> = T extends undefined
  ? NodeType extends {
    schema: infer R;  // 推断 schema 的类型
  }
  ? R
  : any
  : T;

// ==================== IDocumentModel 接口 ====================
/**
 * 文档模型接口
 *
 * 继承：IPublicModelDocumentModel（公开接口）
 *
 * Omit 移除的方法：
 * ```typescript
 * // 分为三类：
 *
 * 1. 内外实现不同：
 *    - detecting, checkNesting, getNodeById
 *    - 内部实现更复杂
 *
 * 2. 在内部不存在：
 *    - exportSchema, importSchema（内部用 export、import）
 *    - onAddNode, onRemoveNode（内部用不同的事件）
 *
 * 3. 事件相关：
 *    - onChangeDetecting, onChangeSelection 等
 *    - 内部用事件总线实现
 * ```
 *
 * 为什么要区分内外接口？
 * - 内部接口：设计器内部使用，完整功能
 * - 公开接口：插件使用，简化封装
 * - 职责分离，安全性
 */
export interface IDocumentModel extends Omit<IPublicModelDocumentModel<
  ISelection,
  IHistory,
  INode,
  IDropLocation,
  IModalNodesManager,
  IProject
>,
  'detecting' |  // 检测系统（内部实现不同）
  'checkNesting' |  // 嵌套检查（内部实现不同）
  'getNodeById' |  // 获取节点（内部用 getNode）
  // 以下属性在内部的 document 中不存在
  'exportSchema' |  // 导出（内部用 export）
  'importSchema' |  // 导入（内部用 import）
  'onAddNode' |  // 节点添加事件（内部用 onNodeCreate）
  'onRemoveNode' |  // 节点移除事件（内部用 onNodeDestroy）
  'onChangeDetecting' |  // 检测变化事件
  'onChangeSelection' |  // 选中变化事件
  'onChangeNodeProp' |  // 属性变化事件
  'onImportSchema' |  // 导入 Schema 事件
  'isDetectingNode' |  // 判断是否检测节点
  'onFocusNodeChanged' |  // 焦点节点变化事件
  'onDropLocationChanged'  // 拖放位置变化事件
> {

  // ========== 核心引用 ==========

  /**
   * 设计器引用
   *
   * 用途：
   * - 访问设计器的其他模块
   * - 获取组件元数据
   * - 访问拖拽系统
   */
  readonly designer: IDesigner;

  /**
   * 选中管理器
   *
   * 职责：
   * - 管理节点的选中状态
   * - 多选、单选
   * - 选中变化事件
   */
  selection: ISelection;

  // ========== 核心属性 ==========

  /**
   * 获取根节点
   *
   * @returns 根节点或 null
   *
   * 根节点类型：
   * - Page: 页面根节点
   * - Component: 低代码组件根节点
   * - Block: 区块根节点
   */
  get rootNode(): INode | null;

  /**
   * 获取模拟器（渲染器）
   *
   * @returns 模拟器接口或 null
   *
   * 说明：
   * - 从 project.simulator 获取
   * - 文档本身不拥有模拟器
   * - 多个文档共享一个模拟器
   */
  get simulator(): ISimulatorHost | null;

  /**
   * 是否激活
   *
   * @returns true - 当前活动文档，false - 非活动文档
   *
   * 激活文档：
   * - 当前正在编辑的文档
   * - 画布显示的文档
   * - 接收用户操作
   *
   * 非激活文档：
   * - 后台文档
   * - 不显示在画布
   * - 不接收操作
   */
  get active(): boolean;

  /**
   * 获取节点映射表
   *
   * @returns Map<id, Node>
   *
   * 用途：
   * - 快速查找节点（O(1)）
   * - 遍历所有节点
   * - 统计节点数量
   */
  get nodesMap(): Map<string, INode>;

  /**
   * 是否为非激活状态（挂起状态）
   *
   * @returns true - 挂起，false - 正常
   *
   * 挂起状态：
   * - 暂停渲染
   * - 不响应操作
   * - 性能优化
   */
  get suspensed(): boolean;

  /**
   * 获取文件名
   *
   * @returns 文件名（如 'index'、'detail'）
   *
   * 文件名来源：
   * - 从根节点的 fileName 属性获取
   * - 用于保存和标识文档
   */
  get fileName(): string;

  /**
   * 获取当前根节点
   *
   * @returns 当前根节点或 null
   *
   * currentRoot vs rootNode：
   * - rootNode: 文档的实际根节点
   * - currentRoot: 当前关注的根节点（可能不同）
   * - 支持子树编辑场景
   */
  get currentRoot(): INode | null;

  // ========== 核心方法 ==========

  /**
   * 判断文档是否为空
   *
   * @returns true - 空文档，false - 有内容
   *
   * 空文档：
   * - 没有根节点
   * - 或根节点无子节点
   */
  isBlank(): boolean;

  /**
   * 根据 ID 获取节点
   *
   * @param id - 节点 ID
   * @returns 节点或 null
   *
   * 实现：
   * - 从 nodesMap 查找
   * - O(1) 时间复杂度
   */
  getNode(id: string): INode | null;

  /**
   * 获取根节点（方法形式）
   *
   * @returns 根节点或 null
   */
  getRoot(): INode | null;

  /**
   * 获取历史记录对象
   *
   * @returns History 实例
   */
  getHistory(): IHistory;

  /**
   * 检查嵌套规则
   *
   * @param dropTarget - 目标节点（容器）
   * @param dragObject - 拖拽对象（节点、Schema 等）
   * @returns true - 可以嵌套，false - 不可以
   *
   * 检查内容：
   * - 目标是否是容器
   * - 嵌套规则是否满足
   * - 祖先黑名单
   * - 父子白名单
   */
  checkNesting(
    dropTarget: INode,
    dragObject: IPublicTypeDragNodeObject | IPublicTypeNodeSchema | INode | IPublicTypeDragNodeDataObject,
  ): boolean;

  /**
   * 获取节点总数
   *
   * @returns 节点数量
   *
   * 用途：
   * - 统计页面复杂度
   * - 性能监控
   * - 限制节点数量
   */
  getNodeCount(): number;

  /**
   * 生成下一个节点 ID
   *
   * @param possibleId - 期望的 ID（可能冲突）
   * @returns 唯一的 ID
   *
   * 逻辑：
   * - possibleId 不冲突：使用它
   * - possibleId 冲突：生成新 ID
   * - possibleId 为空：生成新 ID
   */
  nextId(possibleId: string | undefined): string;

  /**
   * 导入 Schema
   *
   * @param schema - 根 Schema
   * @param checkId - 是否检查 ID 冲突
   *
   * 功能：
   * - 用 Schema 替换整个文档
   * - 重新创建节点树
   */
  import(schema: IPublicTypeRootSchema, checkId?: boolean): void;

  /**
   * 导出 Schema
   *
   * @param stage - 转换阶段
   * @returns 根 Schema 或 undefined
   *
   * 用途：
   * - 保存页面
   * - 传递给渲染器
   * - 克隆页面
   */
  export(stage: IPublicEnumTransformStage): IPublicTypeRootSchema | undefined;

  // ========== 事件方法 ==========

  /**
   * 监听节点创建
   *
   * @param func - 回调函数
   * @returns 清理函数
   */
  onNodeCreate(func: (node: INode) => void): IPublicTypeDisposable;

  /**
   * 监听节点销毁
   *
   * @param func - 回调函数
   * @returns 清理函数
   */
  onNodeDestroy(func: (node: INode) => void): IPublicTypeDisposable;

  /**
   * 监听节点可见性变化
   *
   * @param fn - 回调函数
   * @returns 清理函数
   */
  onChangeNodeVisible(fn: (node: INode, visible: boolean) => void): IPublicTypeDisposable;

  // ========== 节点管理 ==========

  /**
   * 添加待清理节点
   *
   * @param node - 节点
   *
   * 用途：
   * - 标记节点等待清理
   * - 延迟清理机制
   */
  addWillPurge(node: INode): void;

  /**
   * 移除待清理标记
   *
   * @param node - 节点
   *
   * 用途：
   * - 节点重新插入时
   * - 取消清理计划
   */
  removeWillPurge(node: INode): void;

  /**
   * 获取组件元数据
   *
   * @param componentName - 组件名称
   * @returns 组件元数据
   *
   * 说明：
   * - 委托给 designer.getComponentMeta
   * - 便捷访问
   */
  getComponentMeta(componentName: string): IComponentMeta;

  /**
   * 批量插入节点
   *
   * @param parent - 父节点
   * @param thing - 节点数组或数据数组
   * @param at - 插入位置
   * @param copy - 是否复制
   * @returns 插入的节点数组
   *
   * 功能：
   * - 批量创建和插入节点
   * - 支持复制模式
   * - 返回新创建的节点
   */
  insertNodes(parent: INode, thing: INode[] | IPublicTypeNodeData[], at?: number | null, copy?: boolean): INode[];

  // ========== 生命周期方法 ==========

  /**
   * 打开文档
   *
   * @returns 文档实例（链式调用）
   *
   * 功能：
   * - 设置为活动文档
   * - 显示在画布
   * - 开始接收操作
   */
  open(): IDocumentModel;

  /**
   * 移除文档
   *
   * 功能：
   * - 从项目中移除
   * - 不显示在文档列表
   * - 但不立即清理资源
   */
  remove(): void;

  /**
   * 挂起文档
   *
   * 功能：
   * - 暂停渲染
   * - 不响应操作
   * - 性能优化（大量修改时）
   */
  suspense(): void;

  /**
   * 关闭文档
   *
   * 功能：
   * - 清理所有节点
   * - 释放资源
   * - 取消事件监听
   */
  close(): void;

  /**
   * 解除节点关联
   *
   * @param node - 节点
   *
   * 功能：
   * - 从 nodesMap 移除
   * - 从 nodes Set 移除
   * - 不删除节点本身
   */
  unlinkNode(node: INode): void;

  /**
   * 销毁节点
   *
   * @param node - 节点
   *
   * 功能：
   * - unlinkNode + node.purge()
   * - 完全销毁节点
   */
  destroyNode(node: INode): void;
}

// ==================== DocumentModel 类 ====================
/**
 * 文档模型类
 *
 * 职责：
 * - 管理页面的节点树
 * - 协调各个子系统
 * - 提供文档级操作
 *
 * 核心子系统：
 * - Selection: 选中管理
 * - History: 历史记录
 * - ModalNodesManager: 模态框管理
 */
export class DocumentModel implements IDocumentModel {
  // ========== 核心属性：根节点 ==========
  /**
   * 文档的根节点
   *
   * 类型：IRootNode | null
   *
   * 根节点类型：
   * - Page: 页面根节点（最常见）
   * - Component: 低代码组件根节点
   * - Block: 区块根节点
   *
   * null 的情况：
   * - 文档刚创建，还未导入 Schema
   * - 文档已关闭，根节点被清理
   *
   * 为什么是 IRootNode 而不是 INode？
   * - IRootNode 是 INode 的扩展
   * - 包含根节点特有的属性和方法
   * - 如：fileName、dataSource、lifeCycles 等
   */
  rootNode: IRootNode | null;

  // ========== 核心属性：文档 ID ==========
  /**
   * 文档唯一标识
   *
   * 格式：'doc_{uniqueId}'
   *
   * 特点：
   * - 每个文档有唯一 ID
   * - 用于标识和查找文档
   * - 在 Schema 导出时使用
   *
   * 用途：
   * - 项目中区分不同文档
   * - 路由中标识文档
   * - 事件中标识文档
   */
  id: string = uniqueId('doc');

  // ========== 子系统：选中管理 ==========
  /**
   * 选中管理器
   *
   * 类型：ISelection（Selection 类实例）
   *
   * 职责：
   * - 管理节点的选中状态
   * - 单选、多选
   * - 选中变化事件
   * - 获取选中节点
   *
   * 只读：
   * - 创建时初始化
   * - 不能替换
   *
   * 传入 this：
   * - Selection 需要访问文档
   * - 双向引用
   */
  readonly selection: ISelection = new Selection(this);

  // ========== 子系统：历史记录 ==========
  /**
   * 历史记录管理器
   *
   * 类型：IHistory（History 类实例）
   *
   * 职责：
   * - 记录操作历史
   * - 撤销（Undo）
   * - 重做（Redo）
   * - 历史栈管理
   *
   * 只读：
   * - 创建时初始化
   * - 不能替换
   */
  readonly history: IHistory;

  // ========== 子系统：模态框管理 ==========
  /**
   * 模态框节点管理器
   *
   * 类型：IModalNodesManager
   *
   * 职责：
   * - 管理所有模态框节点
   * - 控制模态框的显示/隐藏
   * - 处理模态框的特殊渲染
   *
   * 为什么需要专门管理模态框？
   * - 模态框是浮层，不在正常文档流
   * - 可能需要特殊的渲染方式
   * - 设计态可能不渲染（避免遮挡）
   */
  modalNodesManager: IModalNodesManager;

  // ========== 私有属性：节点映射表 ==========
  /**
   * 节点 ID 到节点的映射
   *
   * 类型：Map<string, INode>
   *
   * 结构：{ 节点ID: Node实例 }
   *
   * 用途：
   * - 快速查找节点（O(1)）
   * - 遍历所有节点
   * - 检查 ID 冲突
   * - 统计节点数量
   *
   * 为什么用 Map 而不是对象？
   * - Map 的 key 可以是任意类型
   * - Map 有 size 属性
   * - Map 的遍历顺序稳定
   * - Map 性能更好
   *
   * 维护机制：
   * - createNode: 自动添加
   * - destroyNode: 自动移除
   * - 保证映射表准确
   */
  private _nodesMap = new Map<string, INode>();

  /**
   * 项目引用
   *
   * 用途：
   * - 访问项目级功能
   * - 获取模拟器
   * - 访问其他文档
   */
  readonly project: IProject;

  /**
   * 设计器引用
   *
   * 用途：
   * - 访问设计器的各个模块
   * - 获取组件元数据
   * - 访问拖拽系统
   * - 发送全局事件
   */
  readonly designer: IDesigner;

  // ========== 私有属性：节点集合 ==========
  /**
   * 节点集合
   *
   * @obx.shallow 装饰器：
   * - MobX 浅监听
   * - Set 的增删会触发更新
   *
   * 类型：Set<INode>
   *
   * 用途：
   * - 存储所有节点
   * - 与 _nodesMap 配合使用
   * - 可能用于某些遍历场景
   *
   * Set vs Map：
   * - Set: 只存储节点（无 key）
   * - Map: 存储 ID -> 节点映射
   * - 两者互补
   *
   * 为什么同时维护 Set 和 Map？
   * - Set: 便于遍历所有节点
   * - Map: 便于按 ID 查找
   * - 不同场景使用不同数据结构
   */
  @obx.shallow private nodes = new Set<INode>();

  // ========== 私有属性：序列 ID ==========
  /**
   * 序列 ID 计数器
   *
   * 用途：
   * - 生成唯一的节点 ID
   * - 自增计数器
   * - 确保 ID 唯一性
   *
   * 工作原理：
   * ```typescript
   * nextId() {
   *   return `node_${this.seqId++}`;
   * }
   * ```
   */
  private seqId = 0;

  /**
   * 事件总线
   *
   * 用途：
   * - 发送文档级事件
   * - onNodeCreate, onNodeDestroy 等
   * - 文档内部通信
   */
  private emitter: IEventBus;

  /**
   * 根节点访问者映射
   *
   * 用途：
   * - 存储对根节点的访问者
   * - 可能用于权限控制或日志
   * - 具体实现待查
   */
  private rootNodeVisitorMap: { [visitorName: string]: any } = {};

  /**
   * 插件附加数据
   *
   * @deprecated 已废弃
   *
   * 说明：
   * - 旧版本的插件数据存储
   * - 现在使用其他机制
   * - 保留以向后兼容
   */
  private _addons: Array<{ name: string; exportData: any }> = [];

  // ========== 计算属性：模拟器 ==========
  /**
   * 获取模拟器（渲染器）
   *
   * @returns 模拟器接口或 null
   *
   * 实现：
   * - 从 project.simulator 获取
   * - 文档不直接拥有模拟器
   * - 项目级共享
   *
   * 为什么从 project 获取？
   * - 多个文档共享一个模拟器
   * - 节省资源
   * - 切换文档时复用模拟器
   */
  get simulator(): ISimulatorHost | null {
    return this.project.simulator;
  }

  /**
   * 获取节点映射表
   *
   * @returns Map<string, INode>
   *
   * 说明：
   * - 返回私有的 _nodesMap
   * - 外部可以访问但不建议修改
   */
  get nodesMap(): Map<string, INode> {
    return this._nodesMap;
  }

  get fileName(): string {
    return this.rootNode?.getExtraProp('fileName', false)?.getAsString() || this.id;
  }

  set fileName(fileName: string) {
    this.rootNode?.getExtraProp('fileName', true)?.setValue(fileName);
  }

  get focusNode(): INode | null {
    if (this._drillDownNode) {
      return this._drillDownNode;
    }
    const selector = engineConfig.get('focusNodeSelector');
    if (selector && typeof selector === 'function') {
      return selector(this.rootNode!);
    }
    return this.rootNode;
  }

  @obx.ref private _drillDownNode: INode | null = null;

  private _modalNode?: INode;

  private _blank?: boolean;

  private inited = false;

  @obx.shallow private willPurgeSpace: INode[] = [];

  get modalNode() {
    return this._modalNode;
  }

  get currentRoot() {
    return this.modalNode || this.focusNode;
  }

  @obx.shallow private activeNodes?: INode[];

  @obx.ref private _dropLocation: IDropLocation | null = null;

  set dropLocation(loc: IDropLocation | null) {
    this._dropLocation = loc;
    // pub event
    this.designer.editor.eventBus.emit(
      'document.dropLocation.changed',
      { document: this, location: loc },
    );
  }

  /**
   * 投放插入位置标记
   */
  get dropLocation() {
    return this._dropLocation;
  }

  /**
   * 导出 schema 数据
   */
  get schema(): IPublicTypeRootSchema {
    return this.rootNode?.schema as any;
  }

  @obx.ref private _opened = false;

  @obx.ref private _suspensed = false;

  /**
   * 是否为非激活状态
   */
  get suspensed(): boolean {
    return this._suspensed || !this._opened;
  }

  /**
   * 与 suspensed 相反，是否为激活状态，这个函数可能用的更多一点
   */
  get active(): boolean {
    return !this._suspensed;
  }

  /**
   * @deprecated 兼容
   */
  get actived(): boolean {
    return this.active;
  }

  /**
   * 是否打开
   */
  get opened() {
    return this._opened;
  }

  get root() {
    return this.rootNode;
  }

  // ========== 构造函数 ==========
  /**
   * 构造 DocumentModel 实例
   *
   * @param project - 所属项目
   * @param schema - 根节点 Schema（可选）
   *
   * 🔄 初始化流程（7步）：
   * ```
   * 1. 启用 MobX 响应式
   * 2. 保存 project 和 designer 引用
   * 3. 创建事件总线
   * 4. 处理空文档标记
   * 5. 创建根节点
   * 6. 创建 History 对象
   * 7. 初始化子系统
   * ```
   *
   * 💡 设计要点：
   *
   * 1️⃣ 空文档处理：
   * ```typescript
   * // 无 schema：创建空白文档
   * const doc = new DocumentModel(project);
   * // -> _blank = true
   * // -> 创建默认 Page 节点
   *
   * // 有 schema：从 schema 创建
   * const doc = new DocumentModel(project, pageSchema);
   * // -> _blank = false
   * // -> 使用提供的 schema
   * ```
   *
   * 2️⃣ 默认根节点：
   * ```typescript
   * // 无 schema 时的默认根节点：
   * {
   *   componentName: 'Page',
   *   id: 'root',
   *   fileName: ''
   * }
   *
   * // 为什么需要默认根节点？
   * // - 文档不能没有根节点
   * // - 提供基础结构
   * // - 用户可以后续添加内容
   * ```
   *
   * 3️⃣ History 的特殊初始化：
   * ```typescript
   * // History 需要两个函数：
   *
   * // saveState: 如何保存当前状态
   * () => this.export(TransformStage.Serilize)
   *
   * // loadState: 如何恢复状态
   * (schema) => {
   *   this.import(schema);
   *   this.simulator?.rerender();  // 重新渲染
   * }
   *
   * // 为什么是函数而不是直接调用？
   * // - 延迟执行
   * // - 每次撤销/重做时调用
   * // - 获取最新状态
   * ```
   *
   * 4️⃣ 兼容旧版本：
   * ```typescript
   * // 兼容 vision（旧版本编辑器）
   * this.id = project.getSchema()?.id || this.id;
   *
   * // 如果项目 schema 有 id，使用它
   * // 否则使用新生成的 id
   * // 保证 ID 的连续性
   * ```
   *
   * 🎯 初始化顺序的重要性：
   *
   * 为什么先创建 rootNode，再创建 history？
   * ```typescript
   * // ✅ 正确顺序：
   * 1. this.rootNode = this.createNode(schema);
   * 2. this.history = new History(...);
   *
   * // 原因：
   * // - History 需要 export() 方法
   * // - export() 需要 rootNode
   * // - 必须先有根节点
   *
   * // ❌ 如果颠倒：
   * 1. this.history = new History(...);
   * 2. this.rootNode = this.createNode(schema);
   *
   * // 问题：
   * // - History 初始化时调用 export()
   * // - 此时 rootNode 还是 null
   * // - export() 会报错
   * ```
   *
   * 🔍 setupListenActiveNodes 的作用：
   * ```typescript
   * // 监听活动节点变化
   * // 活动节点：当前正在操作的节点
   * // 用于：
   * // - 更新属性面板
   * // - 高亮显示
   * // - 联动操作
   * ```
   *
   * @example
   * ```typescript
   * // 示例1：创建空白文档
   * const doc = new DocumentModel(project);
   * // doc._blank = true
   * // doc.rootNode = Page 节点
   * // doc.history = History 实例
   *
   * // 示例2：从 schema 创建
   * const doc = new DocumentModel(project, {
   *   componentName: 'Page',
   *   fileName: 'index',
   *   children: [...]
   * });
   * // doc._blank = false
   * // doc.rootNode = 从 schema 创建的根节点
   * ```
   */
  constructor(project: IProject, schema?: IPublicTypeRootSchema) {
    // ===== 第1步：启用 MobX 响应式 =====
    // 激活所有 @obx 和 @computed 装饰器
    makeObservable(this);

    // ===== 第2步：保存引用 =====
    this.project = project;
    this.designer = this.project?.designer;

    // ===== 第3步：创建事件总线 =====
    // 用于文档级事件：onNodeCreate、onNodeDestroy 等
    this.emitter = createModuleEventBus('DocumentModel');

    // ===== 第4步：处理空文档标记 =====
    // 无 schema -> 空白文档
    if (!schema) {
      this._blank = true;
    }

    // ===== 第5步：兼容旧版本（vision）=====
    // 如果项目 schema 有 id，使用它（保持 ID 连续性）
    this.id = project.getSchema()?.id || this.id;

    // ===== 第6步：创建根节点 =====
    /**
     * createNode() 功能：
     * - 创建 Node 实例
     * - 添加到 nodesMap
     * - 返回节点
     *
     * 无 schema 时的默认值：
     * - componentName: 'Page'（页面节点）
     * - id: 'root'（固定 ID）
     * - fileName: ''（空文件名）
     */
    this.rootNode = this.createNode(
      schema || {
        componentName: 'Page',
        id: 'root',
        fileName: '',
      },
    );

    // ===== 第7步：创建 History 对象 =====
    /**
     * History 构造参数：
     *
     * 1. saveState 函数：
     *    - 如何保存当前状态
     *    - 返回序列化的 schema
     *
     * 2. loadState 函数：
     *    - 如何恢复状态
     *    - 导入 schema 并重新渲染
     *
     * 3. document 引用：
     *    - History 需要访问文档
     *
     * checkId=true 的原因：
     * - 撤销/重做时需要检查 ID
     * - 避免 ID 冲突
     * - 保证数据一致性
     */
    this.history = new History(
      () => this.export(IPublicEnumTransformStage.Serilize),  // 保存函数
      (schema) => {
        this.import(schema as IPublicTypeRootSchema, true);  // 恢复函数
        this.simulator?.rerender();  // 重新渲染
      },
      this,  // 文档引用
    );

    // ===== 第8步：设置活动节点监听 =====
    // 监听节点的激活状态变化
    // 用于属性面板、高亮等功能
    this.setupListenActiveNodes();

    // ===== 第9步：创建模态框管理器 =====
    this.modalNodesManager = new ModalNodesManager(this);

    // ===== 第10步：标记初始化完成 =====
    this.inited = true;
  }

  drillDown(node: INode | null) {
    this._drillDownNode = node;
  }

  onChangeNodeVisible(fn: (node: INode, visible: boolean) => void): IPublicTypeDisposable {
    this.designer.editor?.eventBus.on(EDITOR_EVENT.NODE_VISIBLE_CHANGE, fn);

    return () => {
      this.designer.editor?.eventBus.off(EDITOR_EVENT.NODE_VISIBLE_CHANGE, fn);
    };
  }

  onChangeNodeChildren(fn: (info: IPublicTypeOnChangeOptions<INode>) => void): IPublicTypeDisposable {
    this.designer.editor?.eventBus.on(EDITOR_EVENT.NODE_CHILDREN_CHANGE, fn);

    return () => {
      this.designer.editor?.eventBus.off(EDITOR_EVENT.NODE_CHILDREN_CHANGE, fn);
    };
  }

  addWillPurge(node: INode) {
    this.willPurgeSpace.push(node);
  }

  removeWillPurge(node: INode) {
    const i = this.willPurgeSpace.indexOf(node);
    if (i > -1) {
      this.willPurgeSpace.splice(i, 1);
    }
  }

  isBlank() {
    return !!(this._blank && !this.isModified());
  }

  /**
   * 生成唯一 id
   */
  nextId(possibleId: string | undefined): string {
    let id = possibleId;
    while (!id || this.nodesMap.get(id)) {
      id = `node_${(String(this.id).slice(-10) + (++this.seqId).toString(36)).toLocaleLowerCase()}`;
    }

    return id;
  }

  /**
   * 根据 id 获取节点
   */
  getNode(id: string): INode | null {
    return this._nodesMap.get(id) || null;
  }

  /**
   * 根据 id 获取节点
   */
  getNodeCount(): number {
    return this._nodesMap?.size;
  }

  /**
   * 是否存在节点
   */
  hasNode(id: string): boolean {
    const node = this.getNode(id);
    return node ? !node.isPurged : false;
  }

  onMountNode(fn: (payload: { node: INode }) => void) {
    this.designer.editor.eventBus.on('node.add', fn as any);

    return () => {
      this.designer.editor.eventBus.off('node.add', fn as any);
    };
  }

  // 🔥 【步骤4】根据 Schema 数据创建节点实例的核心方法
  // 这是组件库拖拽的关键步骤：将 NodeData(Schema) 转换为实际的 Node 对象
  @action
  createNode<T extends INode = INode, C = undefined>(data: GetDataType<C, T>): T {
    let schema: any; // 标准化后的 Schema 数据

    // 🎯 处理特殊类型的数据：文本节点或 JS 表达式
    if (isDOMText(data) || isJSExpression(data)) {
      // 将纯文本或表达式包装为 Leaf 节点的 Schema
      schema = {
        componentName: 'Leaf', // 文本节点使用 'Leaf' 作为组件名
        children: data,        // 文本内容或表达式作为子内容
      };
    } else {
      // 🔥 组件库拖拽的数据走这里：直接使用传入的 Schema 数据
      schema = data;
    }

    let node: INode | null = null;

    // ===== 第1步：ID 冲突检查 =====
    /**
     * 防止 ID 冲突
     *
     * 检查逻辑：
     * - 如果 schema.id 已存在于文档中
     * - 清空 schema.id
     * - 让 Node 构造函数生成新 ID
     *
     * 为什么需要检查？
     * - 复制粘贴时可能产生重复 ID
     * - 从模板创建时可能冲突
     * - 保证文档中 ID 唯一
     *
     * 示例：
     * ```typescript
     * // 复制节点：
     * const cloneSchema = node.export(TransformStage.Save);
     * // cloneSchema.id = 'node_123'（与原节点相同）
     *
     * document.createNode(cloneSchema);
     * // 检测到冲突
     * // -> schema.id = null
     * // -> 生成新 ID: 'node_456'
     * ```
     */
    if (this.hasNode(schema?.id)) {
      schema.id = null;  // 清空 ID，强制生成新 ID
    }

    // ===== 第2步：节点复用逻辑（特殊场景）=====
    /**
     * 尝试复用已存在的节点
     *
     * 触发条件（极少）：
     * - schema.id 存在
     * - 文档中有相同 ID 的节点
     * - 组件类型相同
     *
     * 复用场景：
     * - 撤销/重做时
     * - 特殊的节点移动
     *
     * TODO 注释说明：
     * - "底下这几段代码似乎永远都进不去"
     * - 可能是遗留代码
     * - 保留以防特殊情况
     *
     * /* istanbul ignore next */ 标记：
     * - 代码覆盖率工具忽略
     * - 难以测试的代码
     */
    if (schema.id) {
      node = this.getNode(schema.id);  // 尝试获取已存在的节点
      // TODO: 底下这几段代码似乎永远都进不去
      if (node && node.componentName === schema.componentName) {
        // 组件类型相同，可以复用
        if (node.parent) {
          node.internalSetParent(null, false);  // 从原父容器中移除
          // will move to another position
          // todo: this.activeNodes?.push(node);
        }
        node.import(schema, true);  // 用新 Schema 更新现有节点
      } else if (node) {
        node = null;  // 组件类型不匹配，不能复用，重新创建
      }
    }

    // ===== 第3步：创建新节点实例（常规路径）=====
    /**
     * 创建全新的 Node 实例
     *
     * 最常见的路径：
     * - 从组件库拖拽组件
     * - 代码创建节点
     * - 导入 Schema
     *
     * new Node() 内部会：
     * - 生成唯一 ID（如果 schema.id 为空）
     * - 创建 Props 对象
     * - 创建 Children 对象
     * - 初始化所有属性
     * - 启用 MobX 响应式
     */
    if (!node) {
      // 🔥 关键：创建节点实例
      // - this: 当前文档，作为节点的 document 引用
      // - schema: 组件 Schema，包含所有配置
      node = new Node(this, schema);
      // will add
      // todo: this.activeNodes?.push(node);
    }

    // ===== 第4步：注册节点到文档 =====
    /**
     * 双重注册机制
     *
     * 1. _nodesMap: ID -> Node 映射
     *    - 用于快速查找（O(1)）
     *    - getNode(id) 使用
     *
     * 2. nodes Set: 所有节点集合
     *    - 用于遍历所有节点
     *    - 统计节点数量
     *
     * 为什么需要两个？
     * - Map: 按 ID 查找
     * - Set: 遍历所有节点
     * - 不同场景，不同数据结构
     */
    this._nodesMap.set(node.id, node);  // 添加到映射表
    this.nodes.add(node);  // 添加到集合

    // ===== 第5步：发送节点创建事件 =====
    /**
     * 事件通知
     *
     * 事件名：'nodecreate'
     *
     * 监听者：
     * - History: 记录节点创建
     * - 插件: 响应节点创建
     * - UI: 更新显示
     *
     * 使用：
     * ```typescript
     * document.onNodeCreate((node) => {
     *   console.log('创建了节点：', node.componentName);
     * });
     * ```
     */
    this.emitter.emit('nodecreate', node);

    // ===== 第6步：返回创建的节点 =====
    return node as any;  // 返回节点实例
  }

  public destroyNode(node: INode) {
    this.emitter.emit('nodedestroy', node);
  }

  /**
   * 插入一个节点
   */
  insertNode(parent: INode, thing: INode | IPublicTypeNodeData, at?: number | null, copy?: boolean): INode | null {
    return insertChild(parent, thing, at, copy);
  }

  /**
   * 插入多个节点
   */
  insertNodes(parent: INode, thing: INode[] | IPublicTypeNodeData[], at?: number | null, copy?: boolean) {
    return insertChildren(parent, thing, at, copy);
  }

  /**
   * 移除一个节点
   */
  removeNode(idOrNode: string | INode) {
    let id: string;
    let node: INode | null = null;
    if (typeof idOrNode === 'string') {
      id = idOrNode;
      node = this.getNode(id);
    } else if (idOrNode.id) {
      id = idOrNode.id;
      node = this.getNode(id);
    }
    if (!node) {
      return;
    }
    this.internalRemoveAndPurgeNode(node, true);
  }

  /**
   * 内部方法，请勿调用
   */
  internalRemoveAndPurgeNode(node: INode, useMutator = false) {
    if (!this.nodes.has(node)) {
      return;
    }
    node.remove(useMutator);
  }

  unlinkNode(node: INode) {
    this.nodes.delete(node);
    this._nodesMap.delete(node.id);
  }

  /**
   * 包裹当前选区中的节点
   */
  wrapWith(schema: IPublicTypeNodeSchema): INode | null {
    const nodes = this.selection.getTopNodes();
    if (nodes.length < 1) {
      return null;
    }
    const wrapper = this.createNode(schema);
    if (wrapper.isParental()) {
      const first = nodes[0];
      // TODO: check nesting rules x 2
      insertChild(first.parent!, wrapper, first.index);
      insertChildren(wrapper, nodes);
      this.selection.select(wrapper.id);
      return wrapper;
    }

    this.removeNode(wrapper);
    return null;
  }

  // ========== 核心方法：导入 Schema ==========
  /**
   * 导入 Schema，替换整个文档内容
   *
   * @action 装饰器：MobX action，批量修改状态
   * @param schema - 根节点 Schema
   * @param checkId - 是否检查 ID 冲突，默认 false
   *
   * 🔄 导入流程（5步）：
   * ```
   * 1. 保存 drillDownNode ID（如果有）
   * 2. 删除所有非根节点
   * 3. 导入新 Schema 到根节点
   * 4. 重建模态框管理器
   * 5. 恢复 drillDownNode（如果有）
   * ```
   *
   * 💡 设计要点：
   *
   * 1️⃣ runWithGlobalEventOff 包裹：
   * ```typescript
   * runWithGlobalEventOff(() => {
   *   // ... 所有操作
   * });
   *
   * // 作用：
   * // - 临时关闭全局事件
   * // - 避免频繁触发事件
   * // - 操作完成后统一触发
   * // - 性能优化
   *
   * // 场景：
   * // 导入 Schema 会：
   * // - 删除N个旧节点（N个删除事件）
   * // - 创建M个新节点（M个创建事件）
   * // - 如果每次都触发，性能差
   * //
   * // 优化后：
   * // - 关闭事件
   * // - 批量操作
   * // - 最后发送一个"导入完成"事件
   * ```
   *
   * 2️⃣ 饱和式删除（Saturated Delete）：
   * ```typescript
   * // 遍历所有节点，逐个删除
   * this.nodes.forEach(node => {
   *   if (node.isRoot()) return;  // 跳过根节点
   *   this.internalRemoveAndPurgeNode(node, true);
   * });
   *
   * // TODO 注释说明：
   * // "暂时用饱和式删除，原因是 Slot 节点并不是树节点，
   * //  无法正常递归删除"
   *
   * // 为什么不用递归删除？
   * // - Slot 节点不在 children 中
   * // - 递归删除会遗漏 Slot
   * // - 饱和式删除确保删除所有节点
   *
   * // 什么是饱和式删除？
   * // - 遍历所有节点
   * // - 不依赖树结构
   * // - 暴力但可靠
   * ```
   *
   * 3️⃣ drillDownNode 的保持：
   * ```typescript
   * // 保存 drillDownNode ID
   * const drillDownNodeId = this._drillDownNode?.id;
   *
   * // ... 执行导入
   *
   * // 恢复 drillDownNode
   * if (drillDownNodeId) {
   *   this.drillDown(this.getNode(drillDownNodeId));
   * }
   *
   * // 为什么要保持？
   * // - drillDown 是当前聚焦的节点
   * // - 用户可能在编辑子树
   * // - 导入后应该恢复到相同位置
   * // - 提升用户体验
   * ```
   *
   * 4️⃣ 重建模态框管理器：
   * ```typescript
   * this.modalNodesManager = new ModalNodesManager(this);
   *
   * // 为什么要重建？
   * // - 旧节点全部删除
   * // - 模态框引用失效
   * // - 需要重新扫描新节点
   * // - 重建模态框索引
   * ```
   *
   * 🎯 使用场景：
   *
   * 场景1：加载保存的页面
   * ```typescript
   * const savedSchema = await api.loadPage(pageId);
   * document.import(savedSchema);
   * // 页面完全替换
   * ```
   *
   * 场景2：撤销/重做
   * ```typescript
   * history.undo();
   * // 内部调用 document.import(historySchema, true);
   * ```
   *
   * 场景3：应用模板
   * ```typescript
   * const templateSchema = getTemplate('form');
   * document.import(templateSchema, true);  // checkId=true
   * // 避免 ID 冲突
   * ```
   *
   * @example
   * ```typescript
   * // 完整示例：
   * const document = new DocumentModel(project);
   *
   * // 导入 Schema
   * document.import({
   *   componentName: 'Page',
   *   fileName: 'home',
   *   children: [
   *     { componentName: 'Header' },
   *     { componentName: 'Content' }
   *   ]
   * });
   *
   * // 结果：
   * // - 旧节点全部删除
   * // - 新节点全部创建
   * // - 页面完全替换
   * ```
   */
  @action
  import(schema: IPublicTypeRootSchema, checkId = false) {
    // 保存当前的 drillDownNode ID
    const drillDownNodeId = this._drillDownNode?.id;

    // 关闭全局事件，批量操作
    runWithGlobalEventOff(() => {
      // ===== 第1步：删除所有非根节点 =====
      // TODO: 暂时用饱和式删除，原因是 Slot 节点并不是树节点，无法正常递归删除
      this.nodes.forEach(node => {
        if (node.isRoot()) return;  // 跳过根节点
        this.internalRemoveAndPurgeNode(node, true);  // 删除并清理
      });

      // ===== 第2步：导入 Schema 到根节点 =====
      this.rootNode?.import(schema as any, checkId);

      // ===== 第3步：重建模态框管理器 =====
      this.modalNodesManager = new ModalNodesManager(this);

      // ===== 第4步：恢复 drillDownNode =====
      // todo: select added and active track added
      if (drillDownNodeId) {
        this.drillDown(this.getNode(drillDownNodeId));
      }
    });
  }

  // ========== 核心方法：导出 Schema ==========
  /**
   * 导出文档为 Schema
   *
   * @param stage - 转换阶段，默认 Serilize
   * @returns 根节点 Schema 或 undefined
   *
   * 🔄 导出流程：
   * ```
   * 1. 兼容旧版本 stage 参数
   * 2. 调用根节点的 export()
   * 3. 处理置顶节点（__isTopFixed__）
   * 4. 返回 Schema
   * ```
   *
   * 💡 置顶节点处理：
   *
   * 什么是置顶节点？
   * ```typescript
   * // 页面的第一级子节点可以设置 __isTopFixed__
   * {
   *   componentName: 'Page',
   *   children: [
   *     { componentName: 'Header' },
   *     { componentName: 'Content' },
   *     { componentName: 'Footer', props: { __isTopFixed__: true } }
   *     //                                   ^^^^^^^^^^^^^^^^ 置顶标记
   *   ]
   * }
   *
   * // 导出时自动调整顺序：
   * {
   *   componentName: 'Page',
   *   children: [
   *     { componentName: 'Footer', props: { __isTopFixed__: true } },  // 移到第一个
   *     { componentName: 'Header' },
   *     { componentName: 'Content' }
   *   ]
   * }
   *
   * // 为什么要置顶？
   * // - 某些组件需要在最上层渲染
   * // - 如：顶部导航栏
   * // - 保证 z-index 最高
   * ```
   *
   * 置顶逻辑：
   * ```typescript
   * // 1. 查找置顶节点的索引
   * const topIndex = children.findIndex(
   *   child => child.props?.__isTopFixed__
   * );
   *
   * // 2. 如果置顶节点不在第一个位置
   * if (topIndex > 0) {
   *   // 3. 从原位置移除
   *   const topNode = children.splice(topIndex, 1);
   *
   *   // 4. 插入到开头
   *   children.unshift(topNode[0]);
   * }
   * ```
   *
   * 为什么只处理第一级子节点？
   * - 置顶通常只需要在页面级别
   * - 深层嵌套不需要置顶
   * - 简化实现
   *
   * 注释说明：
   * "目前还用不到里层的置顶；如果后面有需要可以考虑
   *  将这段写到 node-children 中的 export"
   *
   * 🎯 使用场景：
   *
   * 场景1：保存页面
   * ```typescript
   * const schema = document.export(TransformStage.Save);
   * await api.savePage(schema);
   * ```
   *
   * 场景2：传递给渲染器
   * ```typescript
   * const schema = document.export(TransformStage.Render);
   * simulator.render(schema);
   * ```
   *
   * 场景3：克隆页面
   * ```typescript
   * const schema = document.export(TransformStage.Clone);
   * const newDoc = project.createDocument(schema);
   * ```
   *
   * @example
   * ```typescript
   * // 示例：保存和加载
   *
   * // 保存：
   * const schema = document.export(TransformStage.Save);
   * localStorage.setItem('page', JSON.stringify(schema));
   *
   * // 加载：
   * const savedSchema = JSON.parse(localStorage.getItem('page'));
   * document.import(savedSchema);
   * ```
   */
  export(stage: IPublicEnumTransformStage = IPublicEnumTransformStage.Serilize): IPublicTypeRootSchema | undefined {
    // ===== 第1步：兼容旧版本 stage =====
    stage = compatStage(stage);

    // ===== 第2步：导出根节点 =====
    // 调用根节点的 export() 方法
    // 根节点会递归导出所有子节点
    const currentSchema = this.rootNode?.export<IPublicTypeRootSchema>(stage);

    // ===== 第3步：处理置顶节点 =====
    // 置顶只作用于 Page 的第一级子节点
    // 目前还用不到里层的置顶；如果后面有需要可以考虑将这段写到 node-children 中的 export
    if (Array.isArray(currentSchema?.children) && currentSchema?.children?.length && currentSchema?.children?.length > 0) {
      // 查找置顶节点的索引
      const FixedTopNodeIndex = currentSchema?.children
        .filter(i => isPlainObject(i))  // 过滤出对象类型的子节点
        .findIndex((i => (i as IPublicTypeNodeSchema).props?.__isTopFixed__));  // 查找置顶标记

      // 如果置顶节点不在第一个位置
      if (FixedTopNodeIndex > 0) {
        // 从原位置移除
        const FixedTopNode = currentSchema?.children.splice(FixedTopNodeIndex, 1);
        // 插入到开头
        currentSchema?.children.unshift(FixedTopNode[0]);
      }
    }

    // ===== 第4步：返回 Schema =====
    return currentSchema;
  }

  /**
   * 导出节点数据
   */
  getNodeSchema(id: string): IPublicTypeNodeData | null {
    const node = this.getNode(id);
    if (node) {
      return node.schema;
    }
    return null;
  }

  /**
   * 是否已修改
   */
  isModified(): boolean {
    return this.history.isSavePoint();
  }

  // FIXME: does needed?
  getComponent(componentName: string): any {
    return this.simulator!.getComponent(componentName);
  }

  getComponentMeta(componentName: string): IComponentMeta {
    return this.designer.getComponentMeta(
      componentName,
      () => this.simulator?.generateComponentMetadata(componentName) || null,
    );
  }

  /**
   * 切换激活，只有打开的才能激活
   * 不激活，打开之后切换到另外一个时发生，比如 tab 视图，切换到另外一个标签页
   */
  private setSuspense(flag: boolean) {
    if (!this._opened && !flag) {
      return;
    }
    this._suspensed = flag;
    this.simulator?.setSuspense(flag);
    if (!flag) {
      this.project.checkExclusive(this);
    }
  }

  suspense() {
    this.setSuspense(true);
  }

  activate() {
    this.setSuspense(false);
  }

  /**
   * 打开，已载入，默认建立时就打开状态，除非手动关闭
   */
  open(): DocumentModel {
    const originState = this._opened;
    this._opened = true;
    if (originState === false) {
      this.designer.postEvent('document-open', this);
    }
    if (this._suspensed) {
      this.setSuspense(false);
    } else {
      this.project.checkExclusive(this);
    }
    return this;
  }

  /**
   * 关闭，相当于 sleep，仍然缓存，停止一切响应，如果有发生的变更没被保存，仍然需要去取数据保存
   */
  close(): void {
    this.setSuspense(true);
    this._opened = false;
  }

  /**
   * 从项目中移除
   */
  remove() {
    this.designer.postEvent('document.remove', { id: this.id });
    this.purge();
    this.project.removeDocument(this);
  }

  purge() {
    this.rootNode?.purge();
    this.nodes.clear();
    this._nodesMap.clear();
    this.rootNode = null;
  }

  checkNesting(
    dropTarget: INode,
    dragObject: IPublicTypeDragNodeObject | IPublicTypeNodeSchema | INode | IPublicTypeDragNodeDataObject,
  ): boolean {
    let items: Array<INode | IPublicTypeNodeSchema>;
    if (isDragNodeDataObject(dragObject)) {
      items = Array.isArray(dragObject.data) ? dragObject.data : [dragObject.data];
    } else if (isDragNodeObject<INode>(dragObject)) {
      items = dragObject.nodes;
    } else if (isNode<INode>(dragObject) || isNodeSchema(dragObject)) {
      items = [dragObject];
    } else {
      console.warn('the dragObject is not in the correct type, dragObject:', dragObject);
      return true;
    }
    return items.every((item) => this.checkNestingDown(dropTarget, item) && this.checkNestingUp(dropTarget, item));
  }

  /**
   * @deprecated since version 1.0.16.
   * Will be deleted in version 2.0.0.
   * Use checkNesting method instead.
   */
  checkDropTarget(dropTarget: INode, dragObject: IPublicTypeDragNodeObject | IPublicTypeDragNodeDataObject): boolean {
    let items: Array<INode | IPublicTypeNodeSchema>;
    if (isDragNodeDataObject(dragObject)) {
      items = Array.isArray(dragObject.data) ? dragObject.data : [dragObject.data];
    } else if (isDragNodeObject<INode>(dragObject)) {
      items = dragObject.nodes;
    } else {
      return false;
    }
    return items.every((item) => this.checkNestingUp(dropTarget, item));
  }

  /**
   * 检查对象对父级的要求，涉及配置 parentWhitelist
   */
  checkNestingUp(parent: INode, obj: IPublicTypeNodeSchema | INode): boolean {
    if (isNode(obj) || isNodeSchema(obj)) {
      const config = isNode(obj) ? obj.componentMeta : this.getComponentMeta(obj.componentName);
      if (config) {
        return config.checkNestingUp(obj, parent);
      }
    }

    return true;
  }

  /**
   * 检查投放位置对子级的要求，涉及配置 childWhitelist
   */
  checkNestingDown(parent: INode, obj: IPublicTypeNodeSchema | INode): boolean {
    const config = parent.componentMeta;
    return config.checkNestingDown(parent, obj);
  }

  // ======= compatibles for vision
  getRoot() {
    return this.rootNode;
  }

  // add toData
  toData(extraComps?: string[]) {
    const node = this.export(IPublicEnumTransformStage.Save);
    const data = {
      componentsMap: this.getComponentsMap(extraComps),
      utils: this.getUtilsMap(),
      componentsTree: [node],
    };
    return data;
  }

  getHistory(): IHistory {
    return this.history;
  }

  /**
   * @deprecated
   */
  /* istanbul ignore next */
  getAddonData(name: string) {
    const addon = this._addons.find((item) => item.name === name);
    if (addon) {
      return addon.exportData();
    }
  }

  /**
   * @deprecated
  */
  /* istanbul ignore next */
  exportAddonData() {
    const addons: {
      [key: string]: any;
    } = {};
    this._addons.forEach((addon) => {
      const data = addon.exportData();
      if (data === null) {
        delete addons[addon.name];
      } else {
        addons[addon.name] = data;
      }
    });
    return addons;
  }

  /**
   * @deprecated
   */
  /* istanbul ignore next */
  registerAddon(name: string, exportData: any) {
    if (['id', 'params', 'layout'].indexOf(name) > -1) {
      throw new Error('addon name cannot be id, params, layout');
    }
    const i = this._addons.findIndex((item) => item.name === name);
    if (i > -1) {
      this._addons.splice(i, 1);
    }
    this._addons.push({
      exportData,
      name,
    });
  }

  /* istanbul ignore next */
  acceptRootNodeVisitor(
    visitorName = 'default',
    visitorFn: (node: IRootNode) => any,
  ) {
    let visitorResult = {};
    if (!visitorName) {
      /* eslint-disable-next-line no-console */
      console.warn('Invalid or empty RootNodeVisitor name.');
    }
    try {
      if (this.rootNode) {
        visitorResult = visitorFn.call(this, this.rootNode);
        this.rootNodeVisitorMap[visitorName] = visitorResult;
      }
    } catch (e) {
      console.error('RootNodeVisitor is not valid.');
      console.error(e);
    }
    return visitorResult;
  }

  /* istanbul ignore next */
  getRootNodeVisitor(name: string) {
    return this.rootNodeVisitorMap[name];
  }

  getComponentsMap(extraComps?: string[]) {
    const componentsMap: IPublicTypeComponentsMap = [];
    // 组件去重
    const exsitingMap: { [componentName: string]: boolean } = {};
    for (const node of this._nodesMap.values()) {
      const { componentName } = node || {};
      if (componentName === 'Slot') continue;
      if (!exsitingMap[componentName]) {
        exsitingMap[componentName] = true;
        if (node.componentMeta?.npm?.package) {
          componentsMap.push({
            ...node.componentMeta.npm,
            componentName,
          });
        } else {
          componentsMap.push({
            devMode: 'lowCode',
            componentName,
          });
        }
      }
    }
    // 合并外界传入的自定义渲染的组件
    if (Array.isArray(extraComps)) {
      extraComps.forEach((componentName) => {
        if (componentName && !exsitingMap[componentName]) {
          const meta = this.getComponentMeta(componentName);
          if (meta?.npm?.package) {
            componentsMap.push({
              ...meta?.npm,
              componentName,
            });
          } else {
            componentsMap.push({
              devMode: 'lowCode',
              componentName,
            });
          }
        }
      });
    }
    return componentsMap;
  }

  /**
   * 获取 schema 中的 utils 节点，当前版本不判断页面中使用了哪些 utils，直接返回资产包中所有的 utils
   * @returns
   */
  getUtilsMap() {
    return this.designer?.editor?.get('assets')?.utils?.map((item: any) => ({
      name: item.name,
      type: item.type || 'npm',
      // TODO 当前只有 npm 类型，content 直接设置为 item.npm，有 function 类型之后需要处理
      content: item.npm,
    }));
  }

  onNodeCreate(func: (node: INode) => void) {
    const wrappedFunc = wrapWithEventSwitch(func);
    this.emitter.on('nodecreate', wrappedFunc);
    return () => {
      this.emitter.removeListener('nodecreate', wrappedFunc);
    };
  }

  onNodeDestroy(func: (node: INode) => void) {
    const wrappedFunc = wrapWithEventSwitch(func);
    this.emitter.on('nodedestroy', wrappedFunc);
    return () => {
      this.emitter.removeListener('nodedestroy', wrappedFunc);
    };
  }

  /**
   * @deprecated
   */
  refresh() {
    console.warn('refresh method is deprecated');
  }

  /**
   * @deprecated
   */
  onRefresh(/* func: () => void */) {
    console.warn('onRefresh method is deprecated');
  }

  onReady(fn: (...args: any[]) => void) {
    this.designer.editor.eventBus.on('document-open', fn);
    return () => {
      this.designer.editor.eventBus.off('document-open', fn);
    };
  }

  private setupListenActiveNodes() {
    // todo:
  }
}

export function isDocumentModel(obj: any): obj is IDocumentModel {
  return obj && obj.rootNode;
}

export function isPageSchema(obj: any): obj is IPublicTypePageSchema {
  return obj?.componentName === 'Page';
}
