/**
 * @file Node 节点类 - 设计器核心数据模型
 * @description 低代码引擎中最核心的类，表示页面中的一个组件节点
 *
 * 📌 核心地位：
 * - Node 是整个引擎的数据基础
 * - 所有页面内容都由 Node 树表示
 * - Schema -> Node -> 渲染器 -> 真实组件
 *
 * 🎯 核心职责：
 * 1. 数据模型：存储节点的所有信息（组件名、属性、子节点等）
 * 2. 树结构：维护父子关系、兄弟关系
 * 3. 状态管理：可见性、锁定、选中等状态
 * 4. 属性管理：Props 的增删改查
 * 5. 生命周期：创建、更新、删除的完整流程
 * 6. 事件系统：发送各种节点事件
 * 7. Schema 转换：import/export Schema
 * 8. 插槽管理：处理组件的 slot
 * 9. 条件渲染：支持 v-if 类似的功能
 * 10. 嵌套检查：验证节点是否可以嵌套
 *
 * 🌲 Node 树结构：
 * ```
 * Page (root)
 * └── Container
 *     ├── Header
 *     │   └── Logo
 *     ├── Body
 *     │   ├── Sidebar
 *     │   └── Content
 *     └── Footer
 *
 * 每个矩形都是一个 Node 实例
 * ```
 *
 * 🔄 Node 的生命周期：
 * ```
 * 1. 创建：new Node(document, schema)
 * 2. 初始化：解析 schema，创建 children 和 props
 * 3. 挂载：加入文档树
 * 4. 更新：属性变化、子节点变化
 * 5. 移除：从文档树移除
 * 6. 清理：purge() 释放资源
 * ```
 *
 * 💾 Node vs Schema：
 * ```typescript
 * // Schema（JSON 数据）：
 * {
 *   componentName: 'Button',
 *   props: { type: 'primary' },
 *   children: 'Click Me'
 * }
 *
 * // Node（运行时对象）：
 * class Node {
 *   componentName = 'Button'
 *   props = Props { type: 'primary' }
 *   children = NodeChildren [TextNode('Click Me')]
 *   parent = ContainerNode
 *   document = DocumentModel
 *   // ... 更多状态和方法
 * }
 * ```
 *
 * 🎨 特殊节点类型：
 * - Page：页面根节点
 * - Slot：插槽节点（内容分发）
 * - Component：低代码组件节点
 * - Leaf：叶子节点（纯文本）
 * - Container：容器节点（可包含子节点）
 *
 * 🔐 节点状态：
 * - visible: 可见性（显示/隐藏）
 * - locked: 锁定状态（不可编辑）
 * - conditional: 条件渲染
 * - selected: 选中状态（在 Selection 中管理）
 *
 * ⚡ 性能优化：
 * - 使用 MobX 实现响应式
 * - 懒加载（按需创建 children）
 * - 计算属性缓存（@computed）
 * - 事件防抖和节流
 *
 * 📚 文档中不存在的隐藏知识：
 * 1. ExtraProp 机制：存储临时数据，不污染 Schema
 * 2. internalToShellNode：内部节点到公开节点的转换
 * 3. conditionGroup：条件组的特殊处理
 * 4. slotFor：反向引用插槽的宿主
 * 5. Mutator：联动逻辑的触发机制
 * 6. zLevel：节点的深度层级（性能优化用）
 * 7. purge vs remove：清理 vs 删除的区别
 *
 * @example
 * ```typescript
 * // 创建节点
 * const buttonNode = new Node(document, {
 *   componentName: 'Button',
 *   props: { type: 'primary' },
 *   children: 'Click Me'
 * });
 *
 * // 操作节点
 * buttonNode.setPropValue('type', 'default');
 * buttonNode.setVisible(false);
 * buttonNode.lock();
 *
 * // 树操作
 * containerNode.insertBefore(buttonNode, refNode);
 * buttonNode.remove();
 *
 * // 导出 Schema
 * const schema = buttonNode.export();
 * ```
 */

import { ReactElement } from 'react';
import { obx, computed, autorun, makeObservable, runInAction, wrapWithEventSwitch, action, createModuleEventBus, IEventBus } from '@alilc/lowcode-editor-core';
import {
  IPublicTypeNodeSchema,  // 节点 Schema 类型
  IPublicTypePropsMap,  // 属性映射类型
  IPublicTypePropsList,  // 属性列表类型
  IPublicTypeNodeData,  // 节点数据类型
  IPublicTypeI18nData,  // 国际化数据类型
  IPublicTypeSlotSchema,  // 插槽 Schema 类型
  IPublicTypePageSchema,  // 页面 Schema 类型
  IPublicTypeComponentSchema,  // 组件 Schema 类型
  IPublicTypeCompositeValue,  // 复合值类型
  GlobalEvent,  // 全局事件枚举
  IPublicTypeComponentAction,  // 组件动作类型
  IPublicModelNode,  // 公开节点模型接口
  IPublicModelExclusiveGroup,  // 互斥组模型接口
  IPublicEnumTransformStage,  // 转换阶段枚举
  IPublicTypeDisposable,  // 可清理对象类型
  IBaseModelNode,  // 基础节点模型接口
} from '@alilc/lowcode-types';
import { compatStage, isDOMText, isJSExpression, isNode, isNodeSchema } from '@alilc/lowcode-utils';
import { ISettingTopEntry } from '@alilc/lowcode-designer';
import { Props, getConvertedExtraKey, IProps } from './props/props';  // 属性管理
import type { IDocumentModel } from '../document-model';  // 文档模型
import { NodeChildren, INodeChildren } from './node-children';  // 子节点管理
import { IProp, Prop } from './props/prop';  // 属性类
import type { IComponentMeta } from '../../component-meta';  // 组件元数据
import { ExclusiveGroup, isExclusiveGroup } from './exclusive-group';  // 互斥组
import type { IExclusiveGroup } from './exclusive-group';
import { includeSlot, removeSlot } from '../../utils/slot';  // 插槽工具
import { foreachReverse } from '../../utils/tree';  // 树工具
import { NodeRemoveOptions, EDITOR_EVENT } from '../../types';  // 类型定义

// ==================== 节点状态接口 ====================
/**
 * 节点状态接口
 *
 * 字段说明：
 * - locking: 是否正在锁定操作中（过渡状态）
 * - pseudo: 是否是伪节点（占位节点）
 * - inPlaceEditing: 是否正在原地编辑（双击编辑文本）
 *
 * 使用场景：
 * - UI 需要根据状态显示不同样式
 * - 操作前检查节点状态
 * - 防止重复操作
 *
 * 伪节点（pseudo）：
 * - 临时占位节点
 * - 不会被导出到 Schema
 * - 用于拖拽预览、插入位置提示等
 */
export interface NodeStatus {
  locking: boolean;  // 锁定操作中
  pseudo: boolean;  // 伪节点
  inPlaceEditing: boolean;  // 原地编辑中
}

// ==================== IBaseNode 接口 ====================
/**
 * 基础节点接口
 *
 * 继承关系：
 * - 继承 IBaseModelNode（公开接口）
 * - Omit 移除部分方法（内部重新实现）
 *
 * 为什么要 Omit 这些方法？
 * ```typescript
 * // 移除的方法分为三类：
 *
 * 1. 类型判断方法：
 *    - isRoot, isPage, isComponent 等
 *    - 内部实现与公开接口不同
 *    - 内部需要更多细节
 *
 * 2. 在内部不存在的方法：
 *    - getExtraPropValue, setExtraPropValue
 *    - exportSchema, importSchema
 *    - 这些是公开 API 的封装，内部用不同的方法
 *
 * 3. 实现有差异的方法：
 *    - isContainer, isEmpty
 *    - 内部实现逻辑更复杂
 *    - 需要访问私有属性
 * ```
 *
 * 为什么要区分内部接口和公开接口？
 * - 内部接口：给设计器内部使用，暴露更多细节
 * - 公开接口：给插件和外部使用，简化和封装
 * - 分离关注点，提高安全性
 */
export interface IBaseNode<Schema extends IPublicTypeNodeSchema = IPublicTypeNodeSchema> extends Omit<IBaseModelNode<
  IDocumentModel,
  IBaseNode,
  INodeChildren,
  IComponentMeta,
  ISettingTopEntry,
  IProps,
  IProp,
  IExclusiveGroup
>,
  'isRoot' |  // 重新实现
  'isPage' |
  'isComponent' |
  'isModal' |
  'isSlot' |
  'isParental' |
  'isLeaf' |
  'settingEntry' |  // 重新实现
  // 在内部的 node 模型中不存在
  'getExtraPropValue' |  // 内部用 getExtraProp
  'setExtraPropValue' |  // 内部用 getExtraProp().setValue()
  'exportSchema' |  // 内部用 export()
  'visible' |  // 内部用 _visible
  'importSchema' |  // 内部用 import()
  // 内外实现有差异
  'isContainer' |  // 内部实现更复杂
  'isEmpty'  // 内部实现更复杂
> {
  // ========== 标识属性 ==========
  /**
   * 节点标识
   * 用于类型判断：isNode(obj)
   */
  isNode: boolean;

  // ========== 核心 getter ==========

  /**
   * 获取组件元数据
   *
   * 用途：
   * - 获取组件的配置信息
   * - 检查嵌套规则
   * - 获取属性配置
   */
  get componentMeta(): IComponentMeta;

  /**
   * 获取设置入口
   *
   * 用途：
   * - 属性面板的入口
   * - 管理属性设置项
   */
  get settingEntry(): ISettingTopEntry;

  /**
   * 是否已被清理
   *
   * purged 状态：
   * - true: 节点已被清理，不可再使用
   * - false: 节点正常
   *
   * 为什么需要这个状态？
   * - 防止使用已清理的节点
   * - 避免内存泄漏
   * - 调试和错误检查
   */
  get isPurged(): boolean;

  /**
   * 获取节点在父节点中的索引
   *
   * 返回：
   * - number: 索引位置（从0开始）
   * - undefined: 节点没有父节点（根节点）
   *
   * 用途：
   * - 确定节点的位置
   * - 插入、移动操作的参考
   */
  get index(): number | undefined;

  /**
   * 是否正在清理中
   *
   * purging 状态：
   * - true: 正在执行 purge()
   * - false: 不在清理中
   *
   * 用途：
   * - 防止重复清理
   * - 清理过程中的状态保护
   */
  get isPurging(): boolean;

  // ========== 核心方法 ==========

  /**
   * 获取节点 ID
   *
   * @returns 节点唯一标识
   */
  getId(): string;

  /**
   * 获取父节点
   *
   * @returns 父节点或 null（根节点没有父节点）
   */
  getParent(): INode | null;

  /**
   * 设置父节点（内部方法）
   *
   * @param parent - 新的父节点
   * @param useMutator - 是否触发联动逻辑
   *
   * ⚠️ 内部方法，请勿直接使用
   *
   * 为什么需要 useMutator 参数？
   * - Mutator 是联动逻辑系统
   * - 某些操作需要触发联动（如自动调整布局）
   * - 某些操作不需要（如内部重组）
   * - 控制是否触发副作用
   */
  internalSetParent(parent: INode | null, useMutator?: boolean): void;

  /**
   * 设置条件组
   *
   * @param grp - 互斥组对象、组ID 或 null
   *
   * 条件组（ExclusiveGroup）：
   * - 一组互斥的条件节点
   * - 类似 switch-case
   * - 同一时间只渲染一个分支
   */
  setConditionGroup(grp: IPublicModelExclusiveGroup | string | null): void;

  /**
   * 转换为 Shell 节点（公开节点）
   *
   * @returns 公开节点接口或 null
   *
   * 内部节点 vs Shell 节点：
   * - 内部节点：设计器内部使用，完整功能
   * - Shell 节点：公开 API，简化封装
   * - 转换层：隔离内部实现和公开接口
   *
   * 为什么需要转换？
   * - 插件不应该访问内部实现
   * - 公开接口更稳定
   * - 保护内部状态
   */
  internalToShellNode(): IPublicModelNode | null;

  /**
   * 开始清理流程（内部）
   *
   * 功能：
   * - 标记为清理中
   * - 执行清理前的准备
   */
  internalPurgeStart(): void;

  /**
   * 解除插槽关联
   *
   * @param slotNode - 插槽节点
   *
   * 功能：
   * - 从 slots 数组移除
   * - 清理反向引用
   */
  unlinkSlot(slotNode: INode): void;

  /**
   * 导出 Schema
   *
   * @param stage - 转换阶段
   * @param options - 导出选项
   * @returns Schema 对象
   *
   * 转换阶段：
   * - Render: 用于渲染的 Schema
   * - Serilize: 用于保存的 Schema
   * - Save: 用于持久化的 Schema
   * - Clone: 用于克隆的 Schema
   * - Upgrade: 用于升级的 Schema
   *
   * 不同阶段的差异：
   * - Render: 可能包含运行时数据
   * - Save: 只包含必要数据，剔除临时数据
   */
  export<T = Schema>(stage: IPublicEnumTransformStage, options?: any): T;

  /**
   * 发送属性变化事件
   *
   * @param val - 属性变化选项
   */
  emitPropChange(val: IPublicTypePropChangeOptions): void;

  /**
   * 导入 Schema 数据
   *
   * @param data - Schema 数据
   * @param checkId - 是否检查 ID 冲突
   *
   * 功能：
   * - 用新的 Schema 替换节点数据
   * - 更新所有属性和子节点
   * - 保持节点 ID（如果 checkId=false）
   */
  import(data: Schema, checkId?: boolean): void;

  /**
   * 设置插槽宿主（内部）
   *
   * @param slotFor - 插槽的宿主属性
   *
   * slotFor 解释：
   * - 插槽节点需要知道它属于哪个宿主
   * - slotFor 是反向引用
   * - 用于插槽的生命周期管理
   */
  internalSetSlotFor(slotFor: Prop | null | undefined): void;

  /**
   * 添加插槽
   *
   * @param slotNode - 插槽节点
   *
   * 功能：
   * - 将节点标记为插槽
   * - 添加到 slots 数组
   * - 建立双向引用
   */
  addSlot(slotNode: INode): void;

  /**
   * 监听可见性变化
   *
   * @param func - 回调函数
   * @returns 清理函数
   */
  onVisibleChange(func: (flag: boolean) => any): () => void;

  /**
   * 获取合适的插入位置
   *
   * @param node - 要插入的节点
   * @param ref - 参考位置
   * @returns 插入位置对象
   *
   * 功能：
   * - 根据参考位置计算最佳插入位置
   * - 考虑嵌套规则
   * - 返回 {parent, index}
   */
  getSuitablePlace(node: INode, ref: any): any;

  /**
   * 监听子节点变化
   *
   * @param fn - 回调函数
   * @returns 清理函数
   */
  onChildrenChange(fn: (param?: { type: string; node: INode }) => void): IPublicTypeDisposable | undefined;

  /**
   * 监听属性变化
   *
   * @param func - 回调函数
   * @returns 清理函数
   */
  onPropChange(func: (info: IPublicTypePropChangeOptions) => void): IPublicTypeDisposable;

  // ========== 类型判断方法 ==========

  /**
   * 是否是模态框节点
   */
  isModal(): boolean;

  /**
   * 是否是根节点
   */
  isRoot(): boolean;

  /**
   * 是否是页面节点（Page）
   */
  isPage(): boolean;

  /**
   * 是否是组件节点（低代码组件）
   */
  isComponent(): boolean;

  /**
   * 是否是插槽节点
   */
  isSlot(): boolean;

  /**
   * 是否是父节点（有子节点的能力）
   */
  isParental(): boolean;

  /**
   * 是否是叶子节点（不能有子节点）
   */
  isLeaf(): boolean;

  /**
   * 是否是容器节点（当前包含子节点）
   */
  isContainer(): boolean;

  /**
   * 是否是空节点（容器但无子节点）
   */
  isEmpty(): boolean;

  // ========== 操作方法 ==========

  /**
   * 移除节点
   *
   * @param useMutator - 是否触发联动逻辑
   * @param purge - 是否立即清理资源
   * @param options - 移除选项
   */
  remove(
    useMutator?: boolean,
    purge?: boolean,
    options?: NodeRemoveOptions,
  ): void;

  /**
   * 节点被拖入时的回调
   *
   * @param dragment - 被拖入的节点
   *
   * 触发时机：
   * - 拖拽结束，节点成功插入
   * - 用于执行拖入后的逻辑
   */
  didDropIn(dragment: INode): void;

  /**
   * 节点被拖出时的回调
   *
   * @param dragment - 被拖出的节点
   *
   * 触发时机：
   * - 子节点被拖走
   * - 用于执行拖出后的逻辑
   */
  didDropOut(dragment: INode): void;

  /**
   * 清理节点资源
   *
   * 功能：
   * - 释放所有引用
   * - 取消事件监听
   * - 清理子节点
   * - 标记为已清理
   *
   * purge vs remove：
   * - remove: 从树中移除，但保留对象
   * - purge: 彻底清理，释放所有资源
   */
  purge(): void;

  /**
   * 移除插槽节点
   *
   * @param slotNode - 插槽节点
   * @returns true - 移除成功，false - 未找到
   */
  removeSlot(slotNode: INode): boolean;

  /**
   * 设置可见性
   *
   * @param flag - true 显示，false 隐藏
   *
   * 可见性的影响：
   * - 隐藏节点不在画布显示
   * - 但仍在大纲树中
   * - 会导出到 Schema
   */
  setVisible(flag: boolean): void;

  /**
   * 获取可见性
   *
   * @returns true - 可见，false - 隐藏
   */
  getVisible(): boolean;

  /**
   * 获取子节点集合
   *
   * @returns NodeChildren 对象或 null
   *
   * null 的情况：
   * - 节点不是容器
   * - 节点是叶子节点
   */
  getChildren(): INodeChildren | null;

  /**
   * 清空属性值
   *
   * @param path - 属性路径
   *
   * 路径格式：
   * - 'style': 顶层属性
   * - 'style.color': 嵌套属性
   * - 0: 数组索引
   */
  clearPropValue(path: string | number): void;

  /**
   * 设置属性集合
   *
   * @param props - 属性对象
   *
   * 功能：
   * - 替换整个 props
   * - 清空旧属性
   * - 设置新属性
   */
  setProps(props?: IPublicTypePropsMap | IPublicTypePropsList | Props | null): void;

  /**
   * 合并属性
   *
   * @param props - 要合并的属性
   *
   * 功能：
   * - 保留已有属性
   * - 添加/更新新属性
   * - 不删除未提供的属性
   */
  mergeProps(props: IPublicTypePropsMap): void;

  /**
   * 是否可以选中
   *
   * @returns true - 可选中，false - 不可选中
   *
   * 不可选中的情况：
   * - 节点被锁定
   * - 节点是伪节点
   * - 节点在清理中
   */
  canSelect(): boolean;
}

// ==================== Node 类文档注释 ====================
/**
 * 基础节点类 - 引擎核心数据结构
 *
 * ════════════════════════════════════════════════════════════
 * 普通节点（基础节点）
 * ════════════════════════════════════════════════════════════
 *
 * [核心属性 - Node Properties]
 * ┌─────────────────────────────────────────────┐
 * │ componentName: 组件名称                      │
 * │   - Page: 页面节点（根节点）                 │
 * │   - Block: 区块节点（低代码组件）            │
 * │   - Component: 组件节点                      │
 * │   - Slot: 插槽节点                           │
 * │                                              │
 * │ props: 组件属性（Props 对象）                │
 * │   - 所有组件属性都存储在这里                 │
 * │   - 支持嵌套属性、JSExpression 等            │
 * │                                              │
 * │ children: 子节点（NodeChildren 对象）        │
 * │   - 容器节点的子节点列表                     │
 * │   - 可以是组件节点或文本节点                 │
 * └─────────────────────────────────────────────┘
 *
 * [指令 - Directives]
 * ┌─────────────────────────────────────────────┐
 * │ loop: 循环渲染（类似 v-for）                 │
 * │   - 根据数组渲染多个节点                     │
 * │   - loopArgs: 循环参数（item, index）        │
 * │                                              │
 * │ condition: 条件渲染（类似 v-if）             │
 * │   - 根据表达式决定是否渲染                   │
 * │   - conditionGroup: 条件组（互斥渲染）       │
 * │                                              │
 * │ title: 节点标题（显示在大纲树）              │
 * │   - 自定义节点名称                           │
 * │   - 不影响实际渲染                           │
 * │                                              │
 * │ isLocked: 锁定状态                           │
 * │   - 锁定后不可选中、编辑                     │
 * │   - 画布和大纲树都生效                       │
 * │                                              │
 * │ hidden: 隐藏状态                             │
 * │   - 不在画布显示                             │
 * │   - 但在大纲树可见                           │
 * │   - 会保存到 Schema                          │
 * │                                              │
 * │ ignored: 忽略标记                            │
 * │   - 不发布到渲染器                           │
 * │   - 但会保存到 Schema                        │
 * │   - 用于临时占位或注释                       │
 * └─────────────────────────────────────────────┘
 *
 * ════════════════════════════════════════════════════════════
 * 根容器节点（Page/Block/Component）
 * ════════════════════════════════════════════════════════════
 *
 * [基础属性 - 与普通节点相同]
 * - componentName, props, children
 *
 * [根容器特有属性 - Root Container Extra Properties]
 * ┌─────────────────────────────────────────────┐
 * │ fileName: 文件名                             │
 * │   - 页面的文件名                             │
 * │                                              │
 * │ meta: 元信息                                 │
 * │   - 页面的元数据                             │
 * │                                              │
 * │ state: 状态定义                              │
 * │   - 页面级状态                               │
 * │   - 类似 React 的 state                      │
 * │                                              │
 * │ defaultProps: 默认属性                       │
 * │   - 组件的默认属性值                         │
 * │                                              │
 * │ dataSource: 数据源                           │
 * │   - 页面的数据源配置                         │
 * │   - API 请求、数据处理等                     │
 * │                                              │
 * │ lifeCycles: 生命周期                         │
 * │   - componentDidMount, componentWillUnmount  │
 * │   - 页面级生命周期钩子                       │
 * │                                              │
 * │ methods: 方法定义                            │
 * │   - 页面级方法                               │
 * │   - 供其他组件调用                           │
 * │                                              │
 * │ css: 样式定义                                │
 * │   - 页面级 CSS                               │
 * │   - 全局样式                                 │
 * └─────────────────────────────────────────────┘
 *
 * [根容器不使用的指令]
 * ❌ loop, loopArgs, condition
 * ❌ conditionGroup, title, ignored
 * ❌ isLocked, hidden
 *
 * 为什么根容器不使用这些指令？
 * - 根容器是页面的唯一入口
 * - 不能被条件渲染或循环渲染
 * - 不能被隐藏或锁定
 * - 保持页面结构的稳定性
 */
export class Node<Schema extends IPublicTypeNodeSchema = IPublicTypeNodeSchema> implements IBaseNode {
  // ========== 私有属性：事件总线 ==========
  /**
   * 事件总线
   *
   * 用途：
   * - 发送节点相关的事件
   * - onPropChange, onChildrenChange 等
   * - 组件间通信
   *
   * 为什么需要事件总线？
   * - 解耦：节点不依赖具体的监听者
   * - 灵活：多个监听者可以同时监听
   * - 扩展：插件可以监听节点事件
   */
  private emitter: IEventBus;

  // ========== 只读属性：节点标识 ==========
  /**
   * 节点类型标识
   *
   * 值：true（常量）
   *
   * 用途：
   * - 类型判断：isNode(obj)
   * - 区分节点和其他对象
   * - TypeScript 类型守卫
   *
   * @example
   * ```typescript
   * if (obj.isNode) {
   *   // 确认是 Node 实例
   *   console.log(obj.componentName);
   * }
   * ```
   */
  readonly isNode = true;

  // ========== 只读属性：节点 ID ==========
  /**
   * 节点唯一标识符
   *
   * 特点：
   * - 只读：创建后不可修改
   * - 唯一：整个项目中唯一
   * - 持久：保存到 Schema 中
   *
   * ID 格式：
   * - 'node_{uniqueId}': 如 'node_k5j2n3'
   * - 使用 uniqueId 生成
   *
   * 用途：
   * - 节点的唯一标识
   * - 跨文档引用节点
   * - 事件中标识节点
   * - 大纲树中的 key
   *
   * 为什么需要持久化？
   * - 保存后再打开，节点 ID 不变
   * - 引用关系保持一致
   * - 历史记录可以定位节点
   */
  readonly id: string;

  // ========== 只读属性：组件名称 ==========
  /**
   * 节点的组件类型
   *
   * 特殊节点类型：
   * ┌─────────────────────────────────────────────┐
   * │ Page: 页面节点                               │
   * │   - 页面的根节点                             │
   * │   - 一个文档只有一个 Page                    │
   * │   - 包含页面级配置                           │
   * │                                              │
   * │ Block: 区块节点                              │
   * │   - 可复用的区块                             │
   * │   - 类似组件但更轻量                         │
   * │                                              │
   * │ Component: 低代码组件节点                    │
   * │   - 用户自定义的低代码组件                   │
   * │   - 由 Schema 定义的组件                     │
   * │                                              │
   * │ Slot: 插槽节点                               │
   * │   - 内容分发占位符                           │
   * │   - 类似 Vue 的 slot                         │
   * │                                              │
   * │ Fragment: 碎片节点                           │
   * │   - 无 props，只有指令                       │
   * │   - 用于包裹多个节点                         │
   * │   - 不产生额外 DOM                           │
   * └─────────────────────────────────────────────┘
   *
   * 普通节点类型：
   * - Button, Input, Select 等
   * - 来自组件库
   * - 有完整的 props 和 children
   *
   * 节点类型的判断：
   * ```typescript
   * if (node.componentName === 'Page') {
   *   // 页面节点
   * } else if (node.componentName === 'Slot') {
   *   // 插槽节点
   * } else {
   *   // 普通组件节点
   * }
   * ```
   */
   *  * Leaf 文字节点 | 表达式节点，无 props，无指令？
   *  * Slot 插槽节点，无 props，正常 children，有 slotArgs，有指令
   */
  readonly componentName: string;

  // ========== 核心属性：Props ==========
  /**
   * 属性集合对象
   *
   * 类型：IProps（Props 类实例）
   *
   * 职责：
   * - 管理节点的所有属性
   * - 支持嵌套属性访问（path）
   * - 响应式更新（MobX）
   * - 属性变化事件
   *
   * 与普通对象的区别：
   * ```typescript
   * // 普通对象：
   * { type: 'primary', size: 'large' }
   *
   * // Props 对象：
   * Props {
   *   items: Map<string, Prop>
   *   get(key): Prop
   *   setValue(key, value)
   *   // ... 更多方法
   * }
   * ```
   *
   * 为什么不用普通对象？
   * - 需要响应式
   * - 需要路径访问
   * - 需要类型转换
   * - 需要事件通知
   */
  props: IProps;

  // ========== 保护属性：子节点集合 ==========
  /**
   * 子节点集合
   *
   * 类型：INodeChildren（NodeChildren 类实例）
   *
   * protected 的原因：
   * - 子类可以访问
   * - 外部通过 getter 访问
   * - 保护内部状态
   *
   * undefined 的情况：
   * - 叶子节点没有 children
   * - 非容器节点没有 children
   */
  protected _children?: INodeChildren;

  // ========== 私有属性：插件数据（废弃）==========
  /**
   * 插件附加数据
   *
   * @deprecated 已废弃，使用 ExtraProp 替代
   *
   * 废弃原因：
   * - 设计不够灵活
   * - ExtraProp 更强大
   * - 向后兼容保留
   */
  private _addons: { [key: string]: { exportData: () => any; isProp: boolean } } = {};

  // ========== 私有属性：父节点引用 ==========
  /**
   * 父节点引用
   *
   * @obx.ref 装饰器：
   * - MobX 可观察引用
   * - 只在引用变化时触发更新
   * - 不深度监听对象内部
   *
   * 初始值：null
   * - 新创建的节点没有父节点
   * - 插入时设置父节点
   *
   * 为什么是私有的？
   * - 防止外部直接修改
   * - 必须通过 internalSetParent()
   * - 保证树结构一致性
   */
  @obx.ref private _parent: INode | null = null;

  /**
   * 获取父节点
   *
   * @returns 父节点或 null
   *
   * null 的情况：
   * - 根节点（没有父节点）
   * - 新创建未插入的节点
   * - 被移除的节点
   */
  get parent(): INode | null {
    return this._parent;
  }

  /**
   * 获取子节点集合
   *
   * @returns NodeChildren 对象或 null
   *
   * null 的情况：
   * - 叶子节点（不支持子节点）
   * - 非容器节点
   *
   * 为什么返回 null 而不是空数组？
   * - 区分"不支持子节点"和"暂无子节点"
   * - null: 不是容器，不能有子节点
   * - []: 是容器，但当前无子节点
   */
  get children(): INodeChildren | null {
    return this._children || null;
  }

  // ========== 计算属性：节点深度 ==========
  /**
   * 节点在树中的深度（层级）
   *
   * @computed 装饰器：
   * - MobX 计算属性
   * - 自动追踪 parent 依赖
   * - 结果会被缓存
   *
   * 计算规则：
   * - 根节点：0
   * - 其他节点：parent.zLevel + 1
   *
   * 递归计算：
   * ```
   * Page (zLevel=0)
   * └── Container (parent.zLevel=0, zLevel=1)
   *     └── Button (parent.zLevel=1, zLevel=2)
   * ```
   *
   * 用途：
   * - 大纲树缩进：indent = zLevel * 16px
   * - 限制嵌套深度：if (zLevel > 10) 警告
   * - 性能优化：避免遍历计算
   *
   * 为什么用计算属性？
   * - 父节点变化时自动更新
   * - 不需要手动维护
   * - 响应式
   */
  @computed get zLevel(): number {
    if (this._parent) {
      return this._parent.zLevel + 1;
    }
    return 0;
  }

  // ========== 计算属性：节点标题 ==========
  /**
   * 节点的显示标题
   *
   * @computed 装饰器：
   * - 自动追踪依赖
   * - ExtraProp 或 componentMeta 变化时更新
   *
   * 优先级：
   * 1. ExtraProp('title'): 用户自定义标题（最高）
   * 2. componentMeta.title: 组件元数据的标题
   *
   * 为什么有两层？
   * - ExtraProp: 用户可以自定义节点标题
   * - componentMeta: 组件的默认标题
   * - 降级机制
   *
   * 使用场景：
   * ```tsx
   * // 大纲树中显示
   * <div className="tree-node-title">
   *   {node.title}
   * </div>
   *
   * // 用户可以编辑：
   * node.getExtraProp('title', true).setValue('我的按钮');
   * // 大纲树显示："我的按钮"
   * ```
   *
   * TODO 注释说明：
   * - descriptor 功能暂未实现
   * - 预留的扩展点
   * - 未来可能从 props 读取标题
   */
  @computed get title(): string | IPublicTypeI18nData | ReactElement {
    // 1. 尝试从 ExtraProp 获取自定义标题
    let t = this.getExtraProp('title');
    // TODO: 暂时走不到这个分支
    // if (!t && this.componentMeta.descriptor) {
    //   t = this.getProp(this.componentMeta.descriptor, false);
    // }
    if (t) {
      const v = t.getAsString();
      if (v) {
        return v;  // 返回自定义标题
      }
    }
    // 2. 降级：返回组件元数据的标题
    return this.componentMeta.title;
  }

  /**
   * 节点图标
   *
   * 说明：
   * - 直接使用组件元数据的图标
   * - 不支持自定义图标（与 title 不同）
   *
   * 为什么不支持自定义？
   * - 图标通常不需要自定义
   * - 保持视觉一致性
   * - 简化实现
   */
  get icon() {
    return this.componentMeta.icon;
  }

  // ========== 初始化标志 ==========
  /**
   * 是否已初始化
   *
   * 用途：
   * - 防止重复初始化
   * - 延迟初始化的标志
   *
   * 初始化包括：
   * - 创建 children
   * - 创建 props
   * - 设置事件监听
   */
  isInited = false;

  // ========== 设置入口 ==========
  /**
   * 设置入口对象
   *
   * 用途：
   * - 属性面板的入口
   * - 管理所有设置项
   * - 懒加载创建
   *
   * 为什么懒加载？
   * - 不是所有节点都会被选中
   * - 不是所有节点都需要设置面板
   * - 按需创建，节省资源
   */
  _settingEntry: ISettingTopEntry;

  /**
   * 获取设置入口
   *
   * 懒加载模式：
   * - 首次访问时创建
   * - 后续访问直接返回缓存
   *
   * 创建过程：
   * - 调用 designer.createSettingEntry()
   * - 传入节点数组（支持多选）
   * - 返回设置入口对象
   */
  get settingEntry(): ISettingTopEntry {
    if (this._settingEntry) return this._settingEntry;  // 已创建，返回缓存
    this._settingEntry = this.document.designer.createSettingEntry([this]);  // 创建
    return this._settingEntry;
  }

  // ========== 自动运行清理函数 ==========
  /**
   * MobX autorun 的清理函数数组
   *
   * 用途：
   * - 存储 autorun 返回的清理函数
   * - purge 时统一清理
   * - 避免内存泄漏
   *
   * autorun 的作用：
   * - 自动追踪依赖
   * - 依赖变化时自动执行
   * - 类似 Vue 的 watch
   */
  private autoruns?: Array<() => void>;

  // ========== RGL 容器标志 ==========
  /**
   * 是否是 React Grid Layout 容器
   *
   * RGL（React Grid Layout）：
   * - 网格布局库
   * - 支持拖拽调整位置和大小
   * - 特殊的容器类型
   *
   * 标志作用：
   * - 标记使用 RGL 的容器
   * - 特殊的拖拽处理
   * - 特殊的子节点管理
   */
  private _isRGLContainer = false;

  /**
   * 设置 RGL 容器标志
   */
  set isRGLContainer(status: boolean) {
    this._isRGLContainer = status;
  }

  /**
   * 获取 RGL 容器标志
   */
  get isRGLContainer(): boolean {
    return !!this._isRGLContainer;
  }

  /**
   * 别名：isRGLContainerNode
   *
   * 说明：
   * - 与 isRGLContainer 相同
   * - 提供更明确的命名
   * - 向后兼容
   */
  set isRGLContainerNode(status: boolean) {
    this._isRGLContainer = status;
  }

  get isRGLContainerNode(): boolean {
    return !!this._isRGLContainer;
  }

  /**
   * 别名：isEmptyNode
   *
   * 说明：
   * - isEmpty() 的 getter 形式
   * - 方便属性访问
   */
  get isEmptyNode() {
    return this.isEmpty();
  }

  // ========== 插槽宿主引用 ==========
  /**
   * 插槽的宿主属性
   *
   * slotFor 解释：
   * - 如果当前节点是插槽节点
   * - slotFor 指向宿主节点的 slots 属性
   * - 反向引用，用于生命周期管理
   *
   * 关系示例：
   * ```typescript
   * // Dialog 组件有 header 插槽
   * dialogNode.props.get('slots')  // 宿主属性
   *   -> headerSlot.slotFor  // 反向引用
   *
   * // 删除 Dialog 时，自动清理 headerSlot
   * ```
   *
   * 三种值：
   * - Prop: 指向宿主属性
   * - null: 不是插槽节点
   * - undefined: 未初始化
   */
  private _slotFor?: IProp | null | undefined = null;

  // ========== 插槽节点数组 ==========
  /**
   * 插槽节点数组
   *
   * @obx.shallow 装饰器：
   * - MobX 浅监听
   * - 数组引用变化时触发
   * - 数组内元素变化时也触发
   * - 但不深度监听元素内部
   *
   * 说明：
   * - 只有容器节点才有插槽
   * - 插槽是特殊的子节点
   * - 用于内容分发
   *
   * 示例：
   * ```
   * Dialog
   * ├── children: [content nodes]
   * └── slots: [header slot, footer slot]
   * ```
   *
   * slots vs children：
   * - children: 主要内容
   * - slots: 命名插槽
   * - 互不影响
   */
  @obx.shallow _slots: INode[] = [];

  /**
   * 获取插槽数组
   *
   * 说明：
   * - 直接返回内部数组
   * - 外部可以修改数组
   * - 修改会触发 MobX 更新
   */
  get slots(): INode[] {
    return this._slots;
  }

  // ========== 条件组引用 ==========
  /**
   * 条件组对象
   *
   * @obx.ref 装饰器：
   * - MobX 引用监听
   * - 引用变化时触发
   *
   * 条件组（ExclusiveGroup）：
   * - 一组互斥的条件节点
   * - 类似 switch-case
   * - 同一时间只渲染一个
   *
   * 示例：
   * ```typescript
   * const group = new ExclusiveGroup();
   * node1.setConditionGroup(group);
   * node2.setConditionGroup(group);
   * node3.setConditionGroup(group);
   *
   * // 渲染时：
   * // 只渲染第一个条件为 true 的节点
   * ```
   *
   * /* istanbul ignore next */ 注释：
   * - 单元测试忽略标记
   * - 代码覆盖率工具跳过
   * - 可能是难以测试的代码
   */
  @obx.ref private _conditionGroup: IExclusiveGroup | null = null;

  /**
   * 获取条件组
   */
  get conditionGroup(): IExclusiveGroup | null {
    return this._conditionGroup;
  }

  // ========== 清理状态标志 ==========
  /**
   * 是否已清理
   *
   * 说明：
   * - purge() 后设为 true
   * - 已清理的节点不可再使用
   * - 访问会抛出错误或返回 null
   */
  private purged = false;

  /**
   * 获取是否已清理
   */
  get isPurged() {
    return this.purged;
  }

  /**
   * 是否正在清理中
   *
   * 说明：
   * - purge() 执行期间为 true
   * - 防止重复清理
   * - 清理中的保护状态
   */
  private purging: boolean = false;

  /**
   * 获取是否正在清理
   */
  get isPurging() {
    return this.purging;
  }

  // ========== 节点状态对象 ==========
  /**
   * 节点状态集合
   *
   * @obx.shallow 装饰器：
   * - 浅监听对象
   * - 对象引用变化或属性变化都触发
   *
   * 状态字段：
   * - inPlaceEditing: 是否正在原地编辑
   * - locking: 是否正在锁定操作中
   * - pseudo: 是否是伪节点
   *
   * 为什么用对象而不是单独的属性？
   * - 相关状态集中管理
   * - 便于批量操作
   * - 减少属性数量
   *
   * 默认值：
   * - 所有状态默认为 false
   * - 节点创建时是正常状态
   */
  @obx.shallow status: NodeStatus = {
    inPlaceEditing: false,  // 不在编辑中
    locking: false,  // 不在锁定操作中
    pseudo: false,  // 不是伪节点
  };

  // ========== 构造函数 ==========
  /**
   * 构造 Node 实例
   *
   * @param document - 所属文档（只读）
   * @param nodeSchema - 节点 Schema
   *
   * 🔄 初始化流程：
   * ```
   * 1. 启用 MobX 响应式
   * 2. 解构 Schema
   * 3. 生成/验证节点 ID
   * 4. 设置组件名称
   * 5. 处理特殊节点（Leaf）
   * 6. 创建 Props 和 Children
   * 7. 初始化内置属性
   * 8. 设置事件监听
   * 9. 标记初始化完成
   * ```
   *
   * 💡 设计要点：
   *
   * 1️⃣ Leaf 节点的特殊处理：
   * ```typescript
   * // Leaf 节点只有 children 属性，没有其他 props
   * {
   *   componentName: 'Leaf',
   *   children: 'Hello World'  // 纯文本或表达式
   * }
   * ```
   *
   * 2️⃣ Props 的三阶段处理：
   * ```typescript
   * // 原始 props -> initProps -> upgradeProps -> 最终 props
   * // initProps: 初始化转换（transformStage.Init）
   * // upgradeProps: 升级转换（transformStage.Upgrade）
   * // 两阶段确保兼容性和扩展性
   * ```
   *
   * 3️⃣ children 的懒加载：
   * ```typescript
   * // NodeChildren 在构造时创建
   * // 但内部节点按需创建（懒加载）
   * // 提升性能
   * ```
   *
   * 4️⃣ 事件转发机制：
   * ```typescript
   * // 节点事件 -> 文档事件 -> 编辑器事件
   * node.onVisibleChange -> document.emit -> editor.emit
   * // 三层转发，便于全局监听
   * ```
   */
  constructor(readonly document: IDocumentModel, nodeSchema: Schema) {
    // ===== 第1步：启用 MobX 响应式 =====
    // 激活所有 @obx、@computed 装饰器
    makeObservable(this);

    // ===== 第2步：解构 Schema =====
    const { componentName, id, children, props, ...extras } = nodeSchema;

    // ===== 第3步：生成/验证节点 ID =====
    // document.nextId() 功能：
    // - 如果 id 存在且不冲突，使用它
    // - 如果 id 冲突，生成新 ID
    // - 如果 id 不存在，生成新 ID
    // - 保证 ID 唯一性
    this.id = document.nextId(id);

    // ===== 第4步：设置组件名称 =====
    this.componentName = componentName;

    // ===== 第5步：处理 Leaf 节点（特殊情况）=====
    /**
     * Leaf 节点的特殊性：
     * - 只有 children 属性（文本或表达式）
     * - 没有其他 props
     * - 不支持子节点
     * - 直接渲染 children 内容
     *
     * 为什么特殊处理？
     * - Leaf 的数据结构不同
     * - 避免创建不必要的 NodeChildren
     * - 性能优化
     */
    if (this.componentName === 'Leaf') {
      // Leaf 节点：只创建 Props，children 作为 prop
      this.props = new Props(this, {
        children: isDOMText(children) || isJSExpression(children) ? children : '',
      });
    } else {
      // ===== 第6步：普通节点处理 =====

      // --- 6.1 创建 Props ---
      // 传入 props 和 extras（指令等）
      this.props = new Props(this, props, extras);

      // --- 6.2 创建 Children ---
      // initialChildren() 处理默认子节点
      this._children = new NodeChildren(this as INode, this.initialChildren(children));

      // --- 6.3 初始化父子关系 ---
      // 设置所有子节点的 parent 引用
      this._children.internalInitParent();

      // --- 6.4 合并和升级 Props ---
      // 两阶段转换：
      // 1. initProps: 初始化转换
      // 2. upgradeProps: 升级转换
      // 分开处理，便于扩展和调试
      this.props.merge(
        this.upgradeProps(this.initProps(props || {})),  // 转换 props
        this.upgradeProps(extras),  // 转换 extras（指令）
      );

      // --- 6.5 设置自动运行 ---
      // 如果组件元数据定义了 autoruns
      // 创建 MobX autorun，自动响应变化
      this.setupAutoruns();
    }

    // ===== 第7步：初始化内置属性 =====
    // 创建 hidden, title, isLocked 等内置属性
    // 提前创建避免后续动态创建导致多次触发 reaction
    this.initBuiltinProps();

    // ===== 第8步：标记初始化完成 =====
    this.isInited = true;

    // ===== 第9步：创建事件总线 =====
    this.emitter = createModuleEventBus('Node');

    // ===== 第10步：设置事件转发 =====
    // 将节点事件转发到编辑器事件总线
    const { editor } = this.document.designer;

    // 转发可见性变化事件
    this.onVisibleChange((visible: boolean) => {
      editor?.eventBus.emit(EDITOR_EVENT.NODE_VISIBLE_CHANGE, this, visible);
    });

    // 转发子节点变化事件
    this.onChildrenChange((info?: { type: string; node: INode }) => {
      editor?.eventBus.emit(EDITOR_EVENT.NODE_CHILDREN_CHANGE, {
        type: info?.type,
        node: this,
      });
    });
  }

  // ========== 私有方法：初始化内置属性 ==========
  /**
   * 初始化内置的 ExtraProps
   *
   * @action 装饰器：
   * - MobX action，批量修改状态
   * - 所有修改合并为一次更新
   * - 性能优化
   *
   * 功能：
   * - 提前创建常用的 ExtraProp
   * - 避免后续动态创建
   * - 防止多次触发 reaction
   *
   * 初始化的属性：
   * - hidden: 隐藏状态（默认 false）
   * - title: 节点标题（默认空字符串）
   * - isLocked: 锁定状态（默认 false）
   * - condition: 条件表达式（默认 true）
   * - conditionGroup: 条件组（默认空字符串）
   * - loop: 循环配置（默认 undefined）
   *
   * 为什么要提前初始化？
   * ```typescript
   * // ❌ 不提前初始化的问题：
   * @computed get isVisible() {
   *   return !this.getExtraProp('hidden')?.getValue();
   *   // 首次访问：创建 hidden prop -> 触发 reaction
   *   // 第二次访问：已存在 -> 不触发
   *   // 导致：相同的访问，有时触发有时不触发
   * }
   *
   * // ✅ 提前初始化的好处：
   * initBuiltinProps() {
   *   this.props.add(false, 'hidden');  // 提前创建
   * }
   * // 后续访问：prop 已存在 -> 不会创建 -> 不触发额外 reaction
   * // 行为一致，可预测
   * ```
   *
   * getConvertedExtraKey() 的作用：
   * - 将属性名转换为 ExtraProp 的 key
   * - 如：'hidden' -> '!hidden'
   * - '!' 前缀标识 ExtraProp
   */
  @action
  private initBuiltinProps() {
    // 使用 || 运算符：如果已存在则不创建
    this.props.has(getConvertedExtraKey('hidden')) || this.props.add(false, getConvertedExtraKey('hidden'));
    this.props.has(getConvertedExtraKey('title')) || this.props.add('', getConvertedExtraKey('title'));
    this.props.has(getConvertedExtraKey('isLocked')) || this.props.add(false, getConvertedExtraKey('isLocked'));
    this.props.has(getConvertedExtraKey('condition')) || this.props.add(true, getConvertedExtraKey('condition'));
    this.props.has(getConvertedExtraKey('conditionGroup')) || this.props.add('', getConvertedExtraKey('conditionGroup'));
    this.props.has(getConvertedExtraKey('loop')) || this.props.add(undefined, getConvertedExtraKey('loop'));
  }

  // ========== 私有方法：初始化属性转换 ==========
  /**
   * 初始化阶段的属性转换
   *
   * @action 装饰器：MobX action
   * @param props - 原始属性
   * @returns 转换后的属性
   *
   * 功能：
   * - 调用设计器的属性转换器
   * - 转换阶段：Init
   *
   * 转换内容：
   * - 处理特殊格式的属性
   * - 兼容旧版本格式
   * - 应用默认值
   *
   * @example
   * ```typescript
   * // 输入：{ onClick: 'function() {...}' }
   * // 输出：{ onClick: Function }  // 字符串转函数
   * ```
   */
  @action
  private initProps(props: any): any {
    return this.document.designer.transformProps(props, this, IPublicEnumTransformStage.Init);
  }

  // ========== 私有方法：升级属性转换 ==========
  /**
   * 升级阶段的属性转换
   *
   * @action 装饰器：MobX action
   * @param props - 初始化后的属性
   * @returns 升级后的属性
   *
   * 功能：
   * - 应用升级转换器
   * - 转换阶段：Upgrade
   *
   * 转换内容：
   * - 版本升级转换
   * - 平台定制转换
   * - 插件扩展转换
   *
   * 为什么分两阶段？
   * - Init: 基础转换，保证数据可用
   * - Upgrade: 高级转换，应用定制逻辑
   * - 分离关注点，便于维护
   */
  @action
  private upgradeProps(props: any): any {
    return this.document.designer.transformProps(props, this, IPublicEnumTransformStage.Upgrade);
  }

  // ========== 私有方法：设置自动运行 ==========
  /**
   * 设置 MobX autorun
   *
   * 功能：
   * - 读取组件元数据的 autoruns 配置
   * - 为每个配置创建 autorun
   * - 存储清理函数
   *
   * autoruns 配置示例：
   * ```typescript
   * {
   *   componentName: 'Select',
   *   configure: {
   *     advanced: {
   *       autoruns: [
   *         {
   *           name: 'options',
   *           autorun: (field) => {
   *             // 当 options 属性变化时自动执行
   *             console.log('options 变化：', field.getValue());
   *           }
   *         }
   *       ]
   *     }
   *   }
   * }
   * ```
   *
   * autorun 的作用：
   * - 自动追踪属性依赖
   * - 属性变化时自动执行回调
   * - 实现联动逻辑
   *
   * 使用场景：
   * - 属性联动：修改 A 属性自动更新 B 属性
   * - 数据校验：属性变化时校验
   * - 副作用：属性变化时执行某些操作
   *
   * 清理机制：
   * - autoruns 数组存储清理函数
   * - purge() 时统一清理
   * - 避免内存泄漏
   */
  private setupAutoruns() {
    // 获取组件元数据的 autoruns 配置
    const { autoruns } = this.componentMeta.advanced;

    // 无配置，直接返回
    if (!autoruns || autoruns.length < 1) {
      return;
    }

    // 为每个配置创建 autorun
    this.autoruns = autoruns.map((item) => {
      // autorun 返回清理函数
      return autorun(() => {
        // 获取对应的设置字段
        const field = this.props.getNode().settingEntry.get(item.name)?.internalToShellField();
        // 执行配置的 autorun 函数
        item.autorun(field);
      });
    });
  }

  // ========== 私有方法：初始化子节点 ==========
  /**
   * 处理初始子节点
   *
   * @param children - Schema 中的 children
   * @returns 标准化的子节点数组
   *
   * 功能：
   * - 处理各种格式的 children
   * - 应用默认子节点（如果配置了）
   * - 统一为数组格式
   *
   * 处理逻辑：
   * ```typescript
   * // 情况1：children 为 null/undefined
   * // -> 使用 initialChildren 配置
   * // -> 或返回空数组
   *
   * // 情况2：children 是数组
   * // -> 直接返回
   *
   * // 情况3：children 是单个对象
   * // -> 包装为数组 [children]
   * ```
   *
   * initialChildren 配置：
   * ```typescript
   * {
   *   componentName: 'Tabs',
   *   configure: {
   *     advanced: {
   *       initialChildren: [
   *         { componentName: 'TabPane', props: { title: 'Tab 1' } },
   *         { componentName: 'TabPane', props: { title: 'Tab 2' } }
   *       ]
   *     }
   *   }
   * }
   *
   * // 或函数形式：
   * initialChildren: (node) => {
   *   return [
   *     { componentName: 'TabPane', props: { title: 'Tab 1' } }
   *   ];
   * }
   * ```
   *
   * 为什么需要 initialChildren？
   * - 某些组件需要默认子节点
   * - 提升用户体验（拖入即可用）
   * - 减少手动配置
   */
  private initialChildren(children: IPublicTypeNodeData | IPublicTypeNodeData[] | undefined): IPublicTypeNodeData[] {
    // 获取默认子节点配置
    const { initialChildren } = this.componentMeta.advanced;

    // ===== 情况1：children 为空 =====
    if (children == null) {
      if (initialChildren) {
        // 有默认子节点配置
        if (typeof initialChildren === 'function') {
          // 函数形式：动态生成
          return initialChildren(this.internalToShellNode()!) || [];
        }
        // 数组形式：直接返回
        return initialChildren;
      }
      // 无配置，返回空数组
      return [];
    }

    // ===== 情况2：children 是数组 =====
    if (Array.isArray(children)) {
      return children;
    }

    // ===== 情况3：children 是单个对象 =====
    // 包装为数组
    return [children];
  }

  // ========== 公开方法：是否是容器 ==========
  /**
   * 判断节点是否是容器
   *
   * @returns true - 是容器，false - 不是
   *
   * 容器判断：
   * - isParentalNode: 有子节点的能力（结构上）
   * - componentMeta.isContainer: 元数据定义为容器
   * - 两者都为 true 才是容器
   *
   * isContainer vs isParental：
   * - isParental: 结构上可以有子节点
   * - isContainer: 元数据定义 + 结构支持
   * - isContainer 更严格
   *
   * @example
   * ```typescript
   * // Div 组件：
   * node.isParentalNode = true  // 结构支持
   * componentMeta.isContainer = true  // 元数据定义
   * node.isContainer() = true  // 是容器
   *
   * // Button 组件（不允许子节点）：
   * node.isParentalNode = true  // 结构支持（技术上可以）
   * componentMeta.isContainer = false  // 元数据禁止
   * node.isContainer() = false  // 不是容器
   * ```
   */
  isContainer(): boolean {
    return this.isContainerNode;
  }

  /**
   * 是否是容器节点
   *
   * 计算属性形式
   */
  get isContainerNode(): boolean {
    return this.isParentalNode && this.componentMeta.isContainer;
  }

  /**
   * 是否是模态框节点
   *
   * @returns true - 是模态框，false - 不是
   *
   * 模态框节点：
   * - Dialog、Modal、Drawer 等
   * - 浮层显示
   * - 可能不在设计态渲染
   */
  isModal(): boolean {

  /**
   * 节点初始化期间就把内置的一些 prop 初始化好，避免后续不断构造实例导致 reaction 执行多次
   */
  @action
  private initBuiltinProps() {
    this.props.has(getConvertedExtraKey('hidden')) || this.props.add(false, getConvertedExtraKey('hidden'));
    this.props.has(getConvertedExtraKey('title')) || this.props.add('', getConvertedExtraKey('title'));
    this.props.has(getConvertedExtraKey('isLocked')) || this.props.add(false, getConvertedExtraKey('isLocked'));
    this.props.has(getConvertedExtraKey('condition')) || this.props.add(true, getConvertedExtraKey('condition'));
    this.props.has(getConvertedExtraKey('conditionGroup')) || this.props.add('', getConvertedExtraKey('conditionGroup'));
    this.props.has(getConvertedExtraKey('loop')) || this.props.add(undefined, getConvertedExtraKey('loop'));
  }

  @action
  private initProps(props: any): any {
    return this.document.designer.transformProps(props, this, IPublicEnumTransformStage.Init);
  }

  @action
  private upgradeProps(props: any): any {
    return this.document.designer.transformProps(props, this, IPublicEnumTransformStage.Upgrade);
  }

  private setupAutoruns() {
    const { autoruns } = this.componentMeta.advanced;
    if (!autoruns || autoruns.length < 1) {
      return;
    }
    this.autoruns = autoruns.map((item) => {
      return autorun(() => {
        item.autorun(this.props.getNode().settingEntry.get(item.name)?.internalToShellField());
      });
    });
  }

  private initialChildren(children: IPublicTypeNodeData | IPublicTypeNodeData[] | undefined): IPublicTypeNodeData[] {
    const { initialChildren } = this.componentMeta.advanced;

    if (children == null) {
      if (initialChildren) {
        if (typeof initialChildren === 'function') {
          return initialChildren(this.internalToShellNode()!) || [];
        }
        return initialChildren;
      }
      return [];
    }

    if (Array.isArray(children)) {
      return children;
    }

    return [children];
  }

  isContainer(): boolean {
    return this.isContainerNode;
  }

  get isContainerNode(): boolean {
    return this.isParentalNode && this.componentMeta.isContainer;
  }

  /**
   * 是否是模态框节点
   *
   * 委托给 isModalNode getter
   */
  isModal(): boolean {
    return this.isModalNode;
  }

  /**
   * 是否是模态框节点（getter 形式）
   *
   * 判断依据：
   * - 从组件元数据获取
   * - componentMeta.isModal
   *
   * 模态框的特点：
   * - 浮层显示（Dialog、Modal、Drawer）
   * - 覆盖其他内容
   * - 设计态特殊处理（可能不渲染）
   *
   * 为什么设计态可能不渲染？
   * - 避免遮挡画布
   * - 影响拖拽操作
   * - 通过配置控制
   */
  get isModalNode(): boolean {
    return this.componentMeta.isModal;
  }

  // ========== 类型判断：是否是根节点 ==========
  /**
   * 是否是根节点
   *
   * @returns true - 是根节点，false - 不是
   *
   * 根节点定义：
   * - 文档的顶层节点
   * - 没有父节点
   * - 通常是 Page 或 Component
   *
   * 判断方式：
   * - 比较 document.rootNode === this
   * - 精确判断
   */
  isRoot(): boolean {
    return this.isRootNode;
  }

  /**
   * 是否是根节点（getter 形式）
   *
   * 实现：
   * - 与文档的 rootNode 比较
   * - (this as any) 类型断言避免类型问题
   */
  get isRootNode(): boolean {
    return this.document.rootNode === (this as any);
  }

  // ========== 类型判断：是否是页面节点 ==========
  /**
   * 是否是页面节点（Page）
   *
   * @returns true - 是页面节点，false - 不是
   *
   * 页面节点的特点：
   * - componentName === 'Page'
   * - 必须是根节点
   * - 一个文档只有一个 Page
   * - 包含页面级配置
   *
   * Page vs Component：
   * - Page: 页面根节点
   * - Component: 低代码组件根节点
   * - 都可以作为根节点
   */
  isPage(): boolean {
    return this.isPageNode;
  }

  /**
   * 是否是页面节点（getter 形式）
   *
   * 判断条件：
   * - isRootNode: 必须是根节点
   * - componentName === 'Page': 组件名必须是 Page
   *
   * 为什么要两个条件？
   * - 保证是真正的页面节点
   * - 非根节点不能是 Page
   * - 根节点不一定是 Page（可能是 Component）
   */
  get isPageNode(): boolean {
    return this.isRootNode && this.componentName === 'Page';
  }

  // ========== 类型判断：是否是低代码组件节点 ==========
  /**
   * 是否是低代码组件节点
   *
   * @returns true - 是低代码组件，false - 不是
   *
   * 低代码组件：
   * - 用户自定义的组件
   * - componentName === 'Component'
   * - 由 Schema 定义
   * - 可复用
   *
   * 与普通组件的区别：
   * - 普通组件：来自组件库（Button、Input 等）
   * - 低代码组件：用户在编辑器中创建
   */
  isComponent(): boolean {
    return this.isComponentNode;
  }

  get isComponentNode(): boolean {
    return this.isRootNode && this.componentName === 'Component';
  }

  isSlot(): boolean {
    return this.isSlotNode;
  }

  get isSlotNode(): boolean {
    return this._slotFor != null && this.componentName === 'Slot';
  }

  /**
   * 是否一个父亲类节点
   */
  isParental(): boolean {
    return this.isParentalNode;
  }

  get isParentalNode(): boolean {
    return !this.isLeafNode;
  }

  /**
   * 终端节点，内容一般为 文字 或者 表达式
   */
  isLeaf(): boolean {
    return this.isLeafNode;
  }
  get isLeafNode(): boolean {
    return this.componentName === 'Leaf';
  }

  internalSetWillPurge() {
    this.internalSetParent(null);
    this.document.addWillPurge(this);
  }

  didDropIn(dragment: INode) {
    const { callbacks } = this.componentMeta.advanced;
    if (callbacks?.onNodeAdd) {
      const cbThis = this.internalToShellNode();
      callbacks?.onNodeAdd.call(cbThis, dragment.internalToShellNode(), cbThis);
    }
    if (this._parent) {
      this._parent.didDropIn(dragment);
    }
  }

  didDropOut(dragment: INode) {
    const { callbacks } = this.componentMeta.advanced;
    if (callbacks?.onNodeRemove) {
      const cbThis = this.internalToShellNode();
      callbacks?.onNodeRemove.call(cbThis, dragment.internalToShellNode(), cbThis);
    }
    if (this._parent) {
      this._parent.didDropOut(dragment);
    }
  }

  /**
   * 内部方法，请勿使用
   * @param useMutator 是否触发联动逻辑
   */
  internalSetParent(parent: INode | null, useMutator = false) {
    if (this._parent === parent) {
      return;
    }

    // 解除老的父子关系，但不需要真的删除节点
    if (this._parent) {
      if (this.isSlot()) {
        this._parent.unlinkSlot(this);
      } else {
        this._parent.children?.unlinkChild(this);
      }
    }
    if (useMutator) {
      this._parent?.didDropOut(this);
    }
    if (parent) {
      // 建立新的父子关系，尤其注意：对于 parent 为 null 的场景，不会赋值，因为 subtreeModified 等事件可能需要知道该 node 被删除前的父子关系
      this._parent = parent;
      this.document.removeWillPurge(this);
      /* istanbul ignore next */
      if (!this.conditionGroup) {
        // initial conditionGroup
        const grp = this.getExtraProp('conditionGroup', false)?.getAsString();
        if (grp) {
          this.setConditionGroup(grp);
        }
      }

      if (useMutator) {
        parent.didDropIn(this);
      }
    }
  }

  internalSetSlotFor(slotFor: Prop | null | undefined) {
    this._slotFor = slotFor;
  }

  internalToShellNode(): IPublicModelNode | null {
    return this.document.designer.shellModelFactory.createNode(this);
  }

  /**
   * 关联属性
   */
  get slotFor(): IProp | null | undefined {
    return this._slotFor;
  }

  // ========== 核心方法：移除节点 ==========
  /**
   * 移除当前节点
   *
   * @param useMutator - 是否触发联动逻辑，默认 true
   * @param purge - 是否立即清理资源，默认 true
   * @param options - 移除选项
   * @param options.suppressRemoveEvent - 是否禁止触发删除事件，默认 false
   *
   * 🔄 完整移除流程：
   * ```
   * 1. 检查是否有父节点
   * 2. 发送顶层删除事件（如果不禁止）
   * 3. 判断节点类型（插槽 or 普通）
   * 4. 从父节点移除
   * 5. 触发联动逻辑（如果 useMutator=true）
   * 6. 清理资源（如果 purge=true）
   * ```
   *
   * 💡 参数说明：
   *
   * useMutator（联动逻辑）：
   * ```typescript
   * // useMutator = true（默认）：
   * node.remove(true);
   * // -> 触发父节点的 onNodeRemove 回调
   * // -> 执行布局调整、状态更新等
   * // -> 用户操作通常需要
   *
   * // useMutator = false：
   * node.remove(false);
   * // -> 不触发联动
   * // -> 撤销/重做时使用
   * // -> 避免重复执行副作用
   * ```
   *
   * purge（资源清理）：
   * ```typescript
   * // purge = true（默认）：
   * node.remove(true, true);
   * // -> 从树中移除
   * // -> 立即清理资源
   * // -> 节点不可再使用
   * // -> 不支持撤销
   *
   * // purge = false：
   * node.remove(true, false);
   * // -> 只从树中移除
   * // -> 保留节点对象
   * // -> 可以重新插入
   * // -> 支持撤销操作
   * ```
   *
   * suppressRemoveEvent（事件控制）：
   * ```typescript
   * // suppressRemoveEvent = false（默认）：
   * node.remove(true, true, { suppressRemoveEvent: false });
   * // -> 发送 'node.remove.topLevel' 事件
   * // -> 插件可以监听
   * // -> 用于日志、统计等
   *
   * // suppressRemoveEvent = true：
   * node.remove(true, true, { suppressRemoveEvent: true });
   * // -> 不发送事件
   * // -> 批量删除时使用
   * // -> 性能优化
   * ```
   *
   * 🎯 实现细节：
   *
   * 1. 事件发送时机：
   *    - 在真正移除之前发送
   *    - 此时节点状态仍完整
   *    - 监听器可以访问节点信息
   *
   * 2. 插槽节点的特殊处理：
   *    - 先从 slots 数组移除
   *    - 再从 children 移除
   *    - 清理双向引用
   *
   * 3. suppressRemoveEvent 的传递：
   *    - 传递给 internalDelete 时设为 true
   *    - 避免重复发送事件
   *    - 顶层发一次即可
   *
   * @example
   * ```typescript
   * // 示例1：用户删除（默认）
   * node.remove();
   * // -> useMutator=true, purge=true
   * // -> 触发联动，立即清理
   * // -> 发送事件
   *
   * // 示例2：撤销操作中
   * node.remove(false, false);
   * // -> 不触发联动，不清理
   * // -> 保留节点，支持重做
   *
   * // 示例3：批量删除
   * nodes.forEach(node => {
   *   node.remove(true, true, { suppressRemoveEvent: true });
   * });
   * // -> 不发送单个事件
   * // -> 最后发送批量事件
   * ```
   */
  remove(
    useMutator = true,
    purge = true,
    options: NodeRemoveOptions = { suppressRemoveEvent: false },
  ) {
    // ===== 检查是否有父节点 =====
    if (this.parent) {
      // ===== 发送顶层删除事件 =====
      // 只在不禁止事件时发送
      if (!options.suppressRemoveEvent) {
        this.document.designer.editor?.eventBus.emit('node.remove.topLevel', {
          node: this,  // 被删除的节点
          index: this.parent?.children?.indexOf(this),  // 原索引位置
        });
      }

      // ===== 根据节点类型处理移除 =====
      if (this.isSlot()) {
        // --- 插槽节点的移除 ---
        // 1. 从 parent.slots 数组移除
        this.parent.removeSlot(this);
        // 2. 从 parent.children 移除（如果在 children 中）
        this.parent.children?.internalDelete(this, purge, useMutator, { suppressRemoveEvent: true });
      } else {
        // --- 普通节点的移除 ---
        // 从 parent.children 移除
        this.parent.children?.internalDelete(this, purge, useMutator, { suppressRemoveEvent: true });
      }
    }
  }

  /**
   * 锁住当前节点
   */
  lock(flag = true) {
    this.setExtraProp('isLocked', flag);
  }

  /**
   * 获取当前节点的锁定状态
   */
  get isLocked(): boolean {
    return !!this.getExtraProp('isLocked')?.getValue();
  }

  canSelect(): boolean {
    const onSelectHook = this.componentMeta?.advanced?.callbacks?.onSelectHook;
    const canSelect = typeof onSelectHook === 'function' ? onSelectHook(this.internalToShellNode()!) : true;
    return canSelect;
  }

  /**
   * 选择当前节点
   */
  select() {
    this.document.selection.select(this.id);
  }

  /**
   * 悬停高亮
   */
  hover(flag = true) {
    if (flag) {
      this.document.designer.detecting.capture(this);
    } else {
      this.document.designer.detecting.release(this);
    }
  }

  /**
   * 节点组件描述
   */
  @computed get componentMeta(): IComponentMeta {
    return this.document.getComponentMeta(this.componentName);
  }

  @computed get propsData(): IPublicTypePropsMap | IPublicTypePropsList | null {
    if (!this.isParental() || this.componentName === 'Fragment') {
      return null;
    }
    return this.props.export(IPublicEnumTransformStage.Serilize).props || null;
  }

  hasSlots() {
    return this._slots.length > 0;
  }

  /* istanbul ignore next */
  setConditionGroup(grp: IPublicModelExclusiveGroup | string | null) {
    let _grp: IExclusiveGroup | null = null;
    if (!grp) {
      this.getExtraProp('conditionGroup', false)?.remove();
      if (this._conditionGroup) {
        this._conditionGroup.remove(this);
        this._conditionGroup = null;
      }
      return;
    }
    if (!isExclusiveGroup(grp)) {
      if (this.prevSibling?.conditionGroup?.name === grp) {
        _grp = this.prevSibling.conditionGroup;
      } else if (this.nextSibling?.conditionGroup?.name === grp) {
        _grp = this.nextSibling.conditionGroup;
      } else if (typeof grp === 'string') {
        _grp = new ExclusiveGroup(grp);
      }
    }
    if (_grp && this._conditionGroup !== _grp) {
      this.getExtraProp('conditionGroup', true)?.setValue(_grp.name);
      if (this._conditionGroup) {
        this._conditionGroup.remove(this);
      }
      this._conditionGroup = _grp;
      _grp?.add(this);
    }
  }

  /* istanbul ignore next */
  isConditionalVisible(): boolean | undefined {
    return this._conditionGroup?.isVisible(this);
  }

  /* istanbul ignore next */
  setConditionalVisible() {
    this._conditionGroup?.setVisible(this);
  }

  hasCondition() {
    const v = this.getExtraProp('condition', false)?.getValue();
    return v != null && v !== '' && v !== true;
  }

  /**
   * has loop when 1. loop is validArray with length > 1 ; OR  2. loop is variable object
   * @return boolean, has loop config or not
   */
  hasLoop() {
    const value = this.getExtraProp('loop', false)?.getValue();
    if (value === undefined || value === null) {
      return false;
    }

    if (Array.isArray(value)) {
      return true;
    }
    if (isJSExpression(value)) {
      return true;
    }
    return false;
  }

  /* istanbul ignore next */
  wrapWith(schema: Schema) {
    const wrappedNode = this.replaceWith({ ...schema, children: [this.export()] });
    return wrappedNode.children!.get(0);
  }

  replaceWith(schema: Schema, migrate = false): any {
    // reuse the same id? or replaceSelection
    schema = Object.assign({}, migrate ? this.export() : {}, schema);
    return this.parent?.replaceChild(this, schema);
  }

  /**
   * 替换子节点
   *
   * @param {INode} node
   * @param {object} data
   */
  replaceChild(node: INode, data: any): INode | null {
    if (this.children?.has(node)) {
      const selected = this.document.selection.has(node.id);

      delete data.id;
      const newNode = this.document.createNode(data);

      if (!isNode(newNode)) {
        return null;
      }

      this.insertBefore(newNode, node, false);
      node.remove(false);

      if (selected) {
        this.document.selection.select(newNode.id);
      }
      return newNode;
    }
    return node;
  }

  setVisible(flag: boolean): void {
    this.getExtraProp('hidden')?.setValue(!flag);
    this.emitter.emit('visibleChange', flag);
  }

  getVisible(): boolean {
    return !this.getExtraProp('hidden')?.getValue();
  }

  onVisibleChange(func: (flag: boolean) => any): () => void {
    const wrappedFunc = wrapWithEventSwitch(func);
    this.emitter.on('visibleChange', wrappedFunc);
    return () => {
      this.emitter.removeListener('visibleChange', wrappedFunc);
    };
  }

  getProp(path: string, createIfNone = true): IProp | null {
    return this.props.query(path, createIfNone) || null;
  }

  getExtraProp(key: string, createIfNone = true): IProp | null {
    return this.props.get(getConvertedExtraKey(key), createIfNone) || null;
  }

  setExtraProp(key: string, value: IPublicTypeCompositeValue) {
    this.getProp(getConvertedExtraKey(key), true)?.setValue(value);
  }

  // ========== 属性操作：获取属性值 ==========
  /**
   * 获取单个属性值
   *
   * @param path - 属性路径
   * @returns 属性值（任意类型）
   *
   * 路径格式支持：
   * ```typescript
   * // 1. 简单属性
   * node.getPropValue('type')
   * // -> 'primary'
   *
   * // 2. 嵌套属性
   * node.getPropValue('style.color')
   * // -> '#ff0000'
   *
   * // 3. 数组索引
   * node.getPropValue('list.0.name')
   * // -> 'Item 1'
   * ```
   *
   * 实现原理：
   * ```typescript
   * getPropValue(path) {
   *   // 1. 获取 Prop 对象（不自动创建）
   *   const prop = this.getProp(path, false);
   *
   *   // 2. 返回 Prop 的值
   *   return prop?.value;
   * }
   * ```
   *
   * 返回值：
   * - 属性存在：返回属性值
   * - 属性不存在：返回 undefined
   * - 不会抛出错误
   *
   * getProp vs getPropValue：
   * - getProp: 返回 Prop 对象（包含元信息）
   * - getPropValue: 直接返回值（简化访问）
   *
   * @example
   * ```typescript
   * // 基础用法
   * const type = node.getPropValue('type');
   * console.log(type);  // 'primary'
   *
   * // 嵌套属性
   * const color = node.getPropValue('style.color');
   * console.log(color);  // '#ff0000'
   *
   * // 不存在的属性
   * const value = node.getPropValue('notExist');
   * console.log(value);  // undefined
   *
   * // 对比：使用 getProp
   * const prop = node.getProp('type');
   * console.log(prop.value);      // 'primary'
   * console.log(prop.key);        // 'type'
   * console.log(prop.isRequired); // false
   * // getProp 提供更多信息
   * ```
   */
  getPropValue(path: string): any {
    return this.getProp(path, false)?.value;
  }

  // ========== 属性操作：设置属性值 ==========
  /**
   * 设置单个属性值
   *
   * @param path - 属性路径
   * @param value - 新值
   *
   * 路径格式支持：
   * ```typescript
   * // 1. 简单属性
   * node.setPropValue('type', 'default')
   *
   * // 2. 嵌套属性
   * node.setPropValue('style.color', '#00ff00')
   *
   * // 3. 数组元素
   * node.setPropValue('list.0.name', 'New Name')
   *
   * // 4. 创建嵌套路径
   * node.setPropValue('style.margin.top', '10px')
   * // 会自动创建 style 和 margin 对象
   * ```
   *
   * 实现原理：
   * ```typescript
   * setPropValue(path, value) {
   *   // 1. 获取或创建 Prop 对象（createIfNone=true）
   *   const prop = this.getProp(path, true);
   *
   *   // 2. 设置值
   *   prop.setValue(value);
   *
   *   // 3. Prop.setValue() 内部会：
   *   //    - 更新值
   *   //    - 发送 propChange 事件
   *   //    - 触发 MobX 更新
   *   //    - 通知渲染器
   * }
   * ```
   *
   * 🔄 设置后的连锁反应：
   * ```
   * node.setPropValue('type', 'default')
   * ↓
   * prop.setValue('default')
   * ↓
   * emit propChange 事件
   * ↓
   * MobX 触发更新
   * ↓
   * @observer 组件重新渲染
   * ↓
   * 画布更新
   * ```
   *
   * 💡 自动创建路径：
   * ```typescript
   * // 初始状态：props = {}
   *
   * node.setPropValue('style.color', 'red');
   *
   * // 自动创建：
   * props = {
   *   style: {
   *     color: 'red'
   *   }
   * }
   *
   * // 再设置：
   * node.setPropValue('style.fontSize', '14px');
   *
   * // 结果：
   * props = {
   *   style: {
   *     color: 'red',
   *     fontSize: '14px'  // 自动添加
   *   }
   * }
   * ```
   *
   * ⚠️ 注意事项：
   *
   * 1. 类型转换：
   * ```typescript
   * node.setPropValue('count', '123');  // 字符串
   * // Prop 存储原始值，不自动转换类型
   * node.getPropValue('count');  // '123'（字符串，不是数字）
   * ```
   *
   * 2. 对象引用：
   * ```typescript
   * const style = { color: 'red' };
   * node.setPropValue('style', style);
   *
   * style.color = 'blue';  // 修改原对象
   * // ❌ 不会触发更新（引用未变）
   *
   * // ✅ 正确做法：
   * node.setPropValue('style', { ...style, color: 'blue' });
   * // 创建新对象，触发更新
   * ```
   *
   * 3. 删除属性：
   * ```typescript
   * // 不是设置为 undefined
   * node.setPropValue('type', undefined);  // ❌ 属性值变为 undefined
   *
   * // 而是使用 clearPropValue
   * node.clearPropValue('type');  // ✅ 删除属性
   * ```
   *
   * @example
   * ```typescript
   * // 示例1：设置简单属性
   * node.setPropValue('type', 'primary');
   * node.setPropValue('disabled', true);
   *
   * // 示例2：设置嵌套属性
   * node.setPropValue('style.color', 'red');
   * node.setPropValue('style.fontSize', '14px');
   *
   * // 示例3：设置表达式
   * node.setPropValue('visible', {
   *   type: 'JSExpression',
   *   value: 'this.state.isVisible'
   * });
   *
   * // 示例4：设置对象
   * node.setPropValue('config', {
   *   theme: 'dark',
   *   lang: 'zh-CN'
   * });
   * ```
   */
  setPropValue(path: string, value: any) {
    this.getProp(path, true)!.setValue(value);
  }

  /**
   * 清除已设置的值
   */
  clearPropValue(path: string): void {
    this.getProp(path, false)?.unset();
  }

  /**
   * 设置多个属性值，和原有值合并
   */
  mergeProps(props: IPublicTypePropsMap) {
    this.props.merge(props);
  }

  /**
   * 设置多个属性值，替换原有值
   */
  setProps(props?: IPublicTypePropsMap | IPublicTypePropsList | Props | null) {
    if (props instanceof Props) {
      this.props = props;
      return;
    }
    this.props.import(props);
  }

  /**
   * 获取节点在父容器中的索引
   */
  @computed get index(): number | undefined {
    if (!this.parent) {
      return -1;
    }
    return this.parent.children?.indexOf(this);
  }

  /**
   * 获取下一个兄弟节点
   */
  get nextSibling(): INode | null | undefined {
    if (!this.parent) {
      return null;
    }
    const { index } = this;
    if (typeof index !== 'number') {
      return null;
    }
    if (index < 0) {
      return null;
    }
    return this.parent.children?.get(index + 1);
  }

  /**
   * 获取上一个兄弟节点
   */
  get prevSibling(): INode | null | undefined {
    if (!this.parent) {
      return null;
    }
    const { index } = this;
    if (typeof index !== 'number') {
      return null;
    }
    if (index < 1) {
      return null;
    }
    return this.parent.children?.get(index - 1);
  }

  /**
   * 获取符合搭建协议-节点 schema 结构
   */
  get schema(): Schema {
    return this.export(IPublicEnumTransformStage.Save);
  }

  set schema(data: Schema) {
    runInAction(() => this.import(data));
  }

  // ========== 核心方法：导入 Schema ==========
  /**
   * 导入 Schema 数据，更新节点
   *
   * @param data - 新的 Schema 数据
   * @param checkId - 是否检查 ID 冲突，默认 false
   *
   * 🔄 导入流程：
   * ```
   * 1. 解构 Schema 数据
   * 2. 处理插槽节点（清空旧子节点）
   * 3. 根据节点类型导入数据
   *    - Parental 节点：导入 props 和 children
   *    - 叶子节点：导入 children 到 props
   * ```
   *
   * 💡 设计要点：
   *
   * 1️⃣ checkId 参数的作用：
   * ```typescript
   * // checkId = false（默认）：
   * node.import(schema, false);
   * // -> 保持子节点的原 ID
   * // -> 用于更新操作
   * // -> 不检查 ID 冲突
   *
   * // checkId = true：
   * node.import(schema, true);
   * // -> 检查并重新生成冲突的 ID
   * // -> 用于复制粘贴操作
   * // -> 避免 ID 冲突
   * ```
   *
   * 2️⃣ 插槽节点的特殊处理：
   * ```typescript
   * // 为什么插槽要清空旧子节点？
   * // - 插槽内容通常完全替换
   * // - 不是增量更新
   * // - 避免残留旧内容
   *
   * // 使用 foreachReverse 反向遍历：
   * // - 避免删除时的索引问题
   * // - 从后往前删除安全
   * ```
   *
   * 3️⃣ Parental 节点 vs 叶子节点：
   * ```typescript
   * // Parental 节点（容器）：
   * if (this.isParental()) {
   *   this.props.import(props, extras);    // 导入属性
   *   this.children.import(children);      // 导入子节点
   * }
   *
   * // 叶子节点（Leaf）：
   * else {
   *   this.props.get('children').setValue(children);  // children 作为属性
   * }
   *
   * // 为什么不同？
   * // - Leaf 的 children 是文本/表达式，不是节点
   * // - Leaf 没有 NodeChildren 对象
   * // - 存储方式不同
   * ```
   *
   * 🎯 使用场景：
   *
   * 场景1：属性面板修改后更新
   * ```typescript
   * // 用户在属性面板修改了组件配置
   * const newSchema = generateSchema(formData);
   * node.import(newSchema);
   * // 节点更新，画布重新渲染
   * ```
   *
   * 场景2：撤销/重做
   * ```typescript
   * // 重做操作，恢复节点状态
   * const oldSchema = history.getSchema(nodeId);
   * node.import(oldSchema, false);  // 保持 ID
   * ```
   *
   * 场景3：模板应用
   * ```typescript
   * // 应用预设模板
   * const templateSchema = getTemplate('form');
   * containerNode.import(templateSchema, true);  // 检查 ID
   * ```
   *
   * ⚠️ 注意事项：
   *
   * 1. 不替换 componentName：
   *    - componentName 在构造时确定
   *    - 不能改变节点类型
   *    - Button 不能变成 Input
   *
   * 2. 不替换 id：
   *    - id 在构造时确定
   *    - 除非 checkId=true
   *    - 保持节点标识稳定
   *
   * 3. 完全替换 props 和 children：
   *    - 不是增量更新
   *    - 是完全替换
   *    - 旧数据会丢失
   *
   * @example
   * ```typescript
   * // 示例1：更新节点
   * const node = document.createNode({
   *   componentName: 'Button',
   *   props: { type: 'primary' }
   * });
   *
   * // 导入新数据
   * node.import({
   *   componentName: 'Button',  // 相同，不变
   *   props: { type: 'default', size: 'large' }  // 完全替换
   * });
   *
   * // 结果：
   * node.props.type = 'default';
   * node.props.size = 'large';
   *
   * // 示例2：复制节点
   * const originalNode = getNode('node_123');
   * const clonedSchema = originalNode.export(TransformStage.Clone);
   *
   * const clonedNode = document.createNode(clonedSchema);
   * clonedNode.import(clonedSchema, true);  // 检查 ID，避免冲突
   * ```
   */
  import(data: Schema, checkId = false) {
    // ===== 第1步：解构 Schema 数据 =====
    const { componentName, id, children, props, ...extras } = data;

    // ===== 第2步：插槽节点特殊处理 =====
    // 清空所有旧子节点
    if (this.isSlot()) {
      foreachReverse(
        this.children!,
        (subNode: INode) => {
          subNode.remove(true, true);  // 删除并清理
        },
        (iterable, idx) => (iterable as INodeChildren).get(idx),
      );
    }

    // ===== 第3步：根据节点类型导入 =====
    if (this.isParental()) {
      // --- Parental 节点（容器）---
      // 导入 props 和 extras（指令）
      this.props.import(props, extras);
      // 导入 children（子节点）
      this._children?.import(children, checkId);
    } else {
      // --- 叶子节点（Leaf）---
      // children 作为 prop 存储
      this.props
        .get('children', true)!  // 获取或创建 children prop
        .setValue(isDOMText(children) || isJSExpression(children) ? children : '');
    }
  }

  /**
   * 转为数据（别名方法）
   *
   * @returns Schema 对象
   *
   * 说明：
   * - toData() 是 export() 的别名
   * - 为了语义更清晰
   * - 默认使用 Save 阶段
   */
  toData() {
    return this.export();
  }

  // ========== 核心方法：导出 Schema ==========
  /**
   * 导出节点为 Schema
   *
   * @param stage - 转换阶段，默认 Save
   * @param options - 导出选项
   * @param options.bypassChildren - 是否跳过 children
   * @returns Schema 对象
   *
   * 🎯 转换阶段说明：
   * ```typescript
   * enum TransformStage {
   *   // 1. Render - 渲染阶段
   *   Render,
   *   // 用途：传递给渲染器
   *   // 特点：包含运行时信息（docId 等）
   *   // 格式：最完整
   *
   *   // 2. Save - 保存阶段
   *   Save,
   *   // 用途：保存到数据库
   *   // 特点：只包含必要数据
   *   // 格式：精简
   *
   *   // 3. Clone - 克隆阶段
   *   Clone,
   *   // 用途：复制节点
   *   // 特点：不包含 ID（避免冲突）
   *   // 格式：需重新生成 ID
   *
   *   // 4. Serilize - 序列化阶段
   *   Serilize,
   *   // 用途：序列化传输
   *   // 特点：可能压缩或编码
   *
   *   // 5. Upgrade - 升级阶段
   *   Upgrade,
   *   // 用途：版本升级
   *   // 特点：应用迁移规则
   * }
   * ```
   *
   * 🔄 导出流程：
   * ```
   * 1. 兼容旧版本的 stage 参数
   * 2. 构建基础 Schema（componentName）
   * 3. 根据 stage 添加特殊字段（id、docId）
   * 4. 处理 Leaf 节点（特殊导出）
   * 5. 导出 props 和 extras
   * 6. 导出 children（如果有）
   * 7. 应用属性转换器
   * 8. 返回完整 Schema
   * ```
   *
   * 💡 不同阶段的差异：
   * ```typescript
   * // Render 阶段：
   * {
   *   id: 'node_123',
   *   docId: 'doc_456',  // ✅ 包含文档 ID
   *   componentName: 'Button',
   *   props: { type: 'primary' },
   *   children: []
   * }
   *
   * // Save 阶段：
   * {
   *   id: 'node_123',  // ✅ 包含节点 ID
   *   componentName: 'Button',
   *   props: { type: 'primary' },
   *   children: []
   * }
   *
   * // Clone 阶段：
   * {
   *   // ❌ 不包含 ID（避免冲突）
   *   componentName: 'Button',
   *   props: { type: 'primary' },
   *   children: []
   * }
   * ```
   *
   * 📋 options 参数：
   * ```typescript
   * // bypassChildren: 跳过 children
   * node.export(stage, { bypassChildren: true });
   * // 用途：
   * // - 只导出节点本身
   * // - 不导出子节点
   * // - 性能优化（大树）
   * ```
   *
   * 🎯 使用场景：
   *
   * 场景1：保存到数据库
   * ```typescript
   * const schema = document.root.export(TransformStage.Save);
   * await api.savePage(schema);
   * ```
   *
   * 场景2：传递给渲染器
   * ```typescript
   * const schema = document.root.export(TransformStage.Render);
   * simulator.render(schema);
   * ```
   *
   * 场景3：复制节点
   * ```typescript
   * const schema = node.export(TransformStage.Clone);
   * const clonedNode = document.createNode(schema);
   * // 新节点有新的 ID
   * ```
   *
   * 场景4：导出单个节点（不含子节点）
   * ```typescript
   * const schema = node.export(TransformStage.Save, {
   *   bypassChildren: true
   * });
   * // 只有节点本身，无 children
   * ```
   *
   * @example
   * ```typescript
   * // 完整示例：保存和加载
   *
   * // 保存：
   * const schema = node.export(TransformStage.Save);
   * localStorage.setItem('node', JSON.stringify(schema));
   *
   * // 加载：
   * const savedSchema = JSON.parse(localStorage.getItem('node'));
   * const newNode = document.createNode(savedSchema);
   * // 或更新现有节点：
   * existingNode.import(savedSchema);
   * ```
   */
  export<T = IPublicTypeNodeSchema>(stage: IPublicEnumTransformStage = IPublicEnumTransformStage.Save, options: any = {}): T {
    // ===== 第1步：兼容旧版本 stage =====
    // compatStage 处理旧的 stage 值
    stage = compatStage(stage);

    // ===== 第2步：构建基础 Schema =====
    const baseSchema: any = {
      componentName: this.componentName,  // 组件名称（必需）
    };

    // ===== 第3步：根据 stage 添加特殊字段 =====

    // --- 非 Clone 阶段：包含 ID ---
    if (stage !== IPublicEnumTransformStage.Clone) {
      baseSchema.id = this.id;
    }

    // --- Render 阶段：包含文档 ID ---
    if (stage === IPublicEnumTransformStage.Render) {
      baseSchema.docId = this.document.id;
    }

    // ===== 第4步：Leaf 节点特殊处理 =====
    if (this.isLeaf()) {
      if (!options.bypassChildren) {
        // Leaf 的 children 在 props 中，作为属性导出
        baseSchema.children = this.props.get('children')?.export(stage);
      }
      return baseSchema;  // Leaf 节点只有 componentName 和 children
    }

    // ===== 第5步：导出 Props 和 Extras =====
    // props.export() 返回 { props, extras }
    // - props: 普通属性
    // - extras: 指令属性（condition、loop 等）
    const { props = {}, extras } = this.props.export(stage) || {};
    const _extras_: { [key: string]: any } = {
      ...extras,
    };
    /* istanbul ignore next */
    Object.keys(this._addons).forEach((key) => {
      const addon = this._addons[key];
      if (addon) {
        if (addon.isProp) {
          (props as any)[getConvertedExtraKey(key)] = addon.exportData();
        } else {
          _extras_[key] = addon.exportData();
        }
      }
    });

    const schema: any = {
      ...baseSchema,
      props: this.document.designer.transformProps(props, this, stage),
      ...this.document.designer.transformProps(_extras_, this, stage),
    };

    if (this.isParental() && this.children && this.children.size > 0 && !options.bypassChildren) {
      schema.children = this.children.export(stage);
    }

    return schema;
  }

  /**
   * 判断是否包含特定节点
   */
  contains(node: INode): boolean {
    return contains(this, node);
  }

  /**
   * 获取特定深度的父亲节点
   */
  getZLevelTop(zLevel: number): INode | null {
    return getZLevelTop(this, zLevel);
  }

  /**
   * 判断与其它节点的位置关系
   *
   *  16 thisNode contains otherNode
   *  8  thisNode contained_by otherNode
   *  2  thisNode before or after otherNode
   *  0  thisNode same as otherNode
   */
  comparePosition(otherNode: INode): PositionNO {
    return comparePosition(this, otherNode);
  }

  unlinkSlot(slotNode: INode) {
    const i = this._slots.indexOf(slotNode);
    if (i < 0) {
      return false;
    }
    this._slots.splice(i, 1);
  }

  /**
   * 删除一个Slot节点
   */
  removeSlot(slotNode: INode): boolean {
    // if (purge) {
    //   // should set parent null
    //   slotNode?.internalSetParent(null, false);
    //   slotNode?.purge();
    // }
    // this.document.unlinkNode(slotNode);
    // this.document.selection.remove(slotNode.id);
    const i = this._slots.indexOf(slotNode);
    if (i < 0) {
      return false;
    }
    this._slots.splice(i, 1);
    return false;
  }

  addSlot(slotNode: INode) {
    const slotName = slotNode?.getExtraProp('name')?.getAsString();
    // 一个组件下的所有 slot，相同 slotName 的 slot 应该是唯一的
    if (includeSlot(this, slotName)) {
      removeSlot(this, slotName);
    }
    slotNode.internalSetParent(this as INode, true);
    this._slots.push(slotNode);
  }

  /**
   * 当前node对应组件是否已注册可用
   */
  isValidComponent() {
    const allComponents = this.document?.designer?.componentsMap;
    if (allComponents && allComponents[this.componentName]) {
      return true;
    }
    return false;
  }

  /**
   * 删除一个节点
   * @param node
   */
  removeChild(node: INode) {
    this.children?.delete(node);
  }

  // ========== 核心方法：清理节点资源 ==========
  /**
   * 清理节点，释放所有资源
   *
   * 🔥 重要：purge 是不可逆的操作！
   *
   * 💀 清理内容：
   * ```
   * 1. 标记为已清理（purged = true）
   * 2. 清理所有 MobX autorun
   * 3. 清理 Props 对象
   * 4. 清理 SettingEntry
   * 5. （注释掉）从文档销毁
   * ```
   *
   * 🆚 purge vs remove 的本质区别：
   * ```typescript
   * // remove（移除）：
   * node.remove();
   * // 效果：
   * // 1. 从父节点的 children 移除 ✅
   * // 2. parent 设为 null ✅
   * // 3. 节点对象保留 ✅
   * // 4. 可以重新插入 ✅
   * // 5. 支持撤销 ✅
   * // 6. 内存未释放 ⚠️
   *
   * // purge（清理）：
   * node.purge();
   * // 效果：
   * // 1. 释放所有引用 ✅
   * // 2. 清理子对象 ✅
   * // 3. 取消事件监听 ✅
   * // 4. 标记为不可用 ✅
   * // 5. 不支持撤销 ❌
   * // 6. 内存可被 GC 回收 ✅
   * ```
   *
   * 📋 调用时机：
   *
   * 1️⃣ remove(true, true) 时：
   * ```typescript
   * node.remove(true, true);
   * // -> parent.children.internalDelete(node, purge=true)
   * // -> node.purge()
   * // 用户删除通常立即清理
   * ```
   *
   * 2️⃣ 文档关闭时：
   * ```typescript
   * document.close();
   * // -> document.root.purge()
   * // -> 递归清理所有节点
   * ```
   *
   * 3️⃣ 历史记录清理时：
   * ```typescript
   * history.clearExpiredNodes();
   * // -> expiredNodes.forEach(n => n.purge())
   * // 过期的历史节点需要清理
   * ```
   *
   * 💡 清理顺序的重要性：
   * ```typescript
   * // ✅ 正确顺序：
   * purge() {
   *   // 1. 标记已清理（防止重入）
   *   this.purged = true;
   *
   *   // 2. 清理 autorun（取消依赖追踪）
   *   this.autoruns?.forEach(dispose => dispose());
   *
   *   // 3. 清理 props（释放属性对象）
   *   this.props.purge();
   *
   *   // 4. 清理 settingEntry（释放设置面板）
   *   this.settingEntry?.purge();
   * }
   *
   * // ❌ 错误顺序：
   * purge() {
   *   this.props.purge();  // 先清理
   *   this.purged = true;  // 后标记
   *   // 问题：清理过程中可能被重入
   * }
   * ```
   *
   * 🐛 被注释的代码：
   * ```typescript
   * // this.document.destroyNode(this);
   *
   * // 为什么被注释掉？
   * // 可能的原因：
   * // 1. 功能重复（NodeChildren 已处理）
   * // 2. 引起循环调用
   * // 3. 性能问题
   * // 4. 测试中发现的问题
   * // 保留注释便于调试和理解历史
   * ```
   *
   * ⚠️ purge 后的节点状态：
   * ```typescript
   * node.purge();
   *
   * // 访问节点：
   * node.isPurged  // true
   * node.props     // 已清理，方法调用可能报错
   * node.children  // 已清理
   * node.parent    // 仍保留（未清空，用于事件处理）
   *
   * // 操作节点：
   * node.setPropValue('type', 'primary');  // ❌ 报错或无效
   * node.remove();  // ❌ 已清理，不可操作
   * ```
   *
   * 🎯 设计决策：
   *
   * Q: 为什么不在 purge 中清理 parent？
   * A: - parent 引用可能在事件处理中需要
   *    - 延迟清理，由 GC 自动回收
   *    - 避免过早断开引用导致错误
   *
   * Q: 为什么不清理 children？
   * A: - children 的清理由 NodeChildren 负责
   *    - 避免重复清理
   *    - 职责分离
   *
   * @example
   * ```typescript
   * // 完整的清理流程
   * function deleteNodeCompletely(node) {
   *   // 1. 从树中移除
   *   node.remove(true, false);  // 不立即清理
   *
   *   // 2. 记录到历史
   *   history.push({
   *     type: 'remove',
   *     node: node,
   *     parent: node.parent,
   *     index: node.index
   *   });
   *
   *   // 3. 等待一段时间（支持撤销）
   *   setTimeout(() => {
   *     // 4. 清理资源
   *     node.purge();
   *   }, 60000);  // 60秒后清理
   * }
   * ```
   */
  purge() {
    // ===== 防止重复清理 =====
    if (this.purged) {
      return;  // 已清理，直接返回
    }

    // ===== 第1步：标记为已清理 =====
    this.purged = true;

    // ===== 第2步：清理 MobX autorun =====
    // 取消所有自动运行
    // 停止依赖追踪
    // 释放闭包引用
    this.autoruns?.forEach((dispose) => dispose());

    // ===== 第3步：清理 Props 对象 =====
    // props.purge() 会：
    // - 清理所有 Prop 实例
    // - 释放属性值引用
    // - 取消事件监听
    this.props.purge();

    // ===== 第4步：清理 SettingEntry =====
    // settingEntry?.purge() 会：
    // - 清理所有设置字段
    // - 释放设置面板引用
    // - 取消事件监听
    this.settingEntry?.purge();

    // ===== 第5步：（注释掉）从文档销毁 =====
    // this.document.destroyNode(this);
    // 为什么被注释？
    // - 可能导致问题
    // - 或功能重复
    // - 保留以便调试
  }

  /**
   * 开始清理流程（内部方法）
   *
   * 功能：
   * - 标记为清理中（purging = true）
   * - 用于清理过程的状态保护
   *
   * 调用时机：
   * - 在实际清理之前调用
   * - 防止清理过程中被重入
   *
   * 使用场景：
   * ```typescript
   * function safeDelete(node) {
   *   if (node.isPurging) {
   *     return;  // 正在清理，不重复操作
   *   }
   *
   *   node.internalPurgeStart();  // 标记开始
   *   // ... 执行清理逻辑
   *   node.purge();  // 实际清理
   * }
   * ```
   */
  internalPurgeStart() {
    this.purging = true;
  }

  /**
   * 是否可执行某 action
   */
  canPerformAction(actionName: string): boolean {
    const availableActions =
      this.componentMeta?.availableActions?.filter((action: IPublicTypeComponentAction) => {
        const { condition } = action;
        return typeof condition === 'function' ?
          condition(this) !== false :
          condition !== false;
      })
        .map((action: IPublicTypeComponentAction) => action.name) || [];

    return availableActions.indexOf(actionName) >= 0;
  }

  // ======= compatible apis ====
  isEmpty(): boolean {
    return this.children ? this.children.isEmpty() : true;
  }

  getChildren() {
    return this.children;
  }

  getComponentName() {
    return this.componentName;
  }

  insert(node: INode, ref?: INode, useMutator = true) {
    this.insertAfter(node, ref, useMutator);
  }

  // ========== 树操作：在指定节点前插入 ==========
  /**
   * 在参考节点之前插入新节点
   *
   * @param node - 要插入的节点
   * @param ref - 参考节点（可选）
   * @param useMutator - 是否触发联动逻辑，默认 true
   *
   * 插入位置：
   * ```typescript
   * // 有 ref：插入到 ref 之前
   * container.insertBefore(newNode, refNode);
   * // Container
   * // ├── Child1
   * // ├── newNode    <- 插入到这里
   * // ├── refNode    <- 参考节点
   * // └── Child2
   *
   * // 无 ref：插入到开头（index=null 时的行为）
   * container.insertBefore(newNode);
   * // Container
   * // ├── newNode    <- 插入到开头
   * // ├── Child1
   * // └── Child2
   * ```
   *
   * 实现原理：
   * ```typescript
   * insertBefore(node, ref, useMutator) {
   *   // 1. 确保 node 是 Node 实例
   *   const nodeInstance = ensureNode(node, this.document);
   *
   *   // 2. 计算插入索引
   *   const index = ref ? ref.index : null;
   *
   *   // 3. 调用 children 的插入方法
   *   this.children?.internalInsert(nodeInstance, index, useMutator);
   *
   *   // internalInsert 会：
   *   // - 在指定位置插入节点
   *   // - 设置 parent 引用
   *   // - 触发 childrenChange 事件
   *   // - 触发 Mutator（如果需要）
   * }
   * ```
   *
   * ensureNode 的作用：
   * ```typescript
   * // 参数可能是：
   * // 1. Node 实例 -> 直接使用
   * // 2. Schema 对象 -> 创建 Node
   * // 3. Node from other document -> 克隆
   *
   * function ensureNode(node, document) {
   *   if (node.document === document) {
   *     return node;  // 同一文档，直接用
   *   }
   *   // 不同文档，需要克隆
   *   const schema = node.export(TransformStage.Clone);
   *   return document.createNode(schema);
   * }
   * ```
   *
   * 🎯 使用场景：
   *
   * 场景1：在特定位置插入
   * ```typescript
   * // 在 Button2 之前插入 Button1
   * container.insertBefore(button1, button2);
   *
   * // 结果：
   * // Container
   * // ├── Header
   * // ├── Button1   <- 新插入
   * // ├── Button2   <- 参考位置
   * // └── Footer
   * ```
   *
   * 场景2：插入到开头
   * ```typescript
   * // 不传 ref，插入到开头
   * container.insertBefore(headerNode);
   *
   * // 结果：
   * // Container
   * // ├── Header    <- 插入到开头
   * // ├── Child1
   * // └── Child2
   * ```
   *
   * 场景3：撤销操作中
   * ```typescript
   * // 撤销删除：恢复节点到原位置
   * const historyItem = history.pop();
   * const { node, parent, refNode } = historyItem;
   *
   * parent.insertBefore(node, refNode, false);  // 不触发联动
   * // 恢复原样，不执行副作用
   * ```
   *
   * 场景4：拖拽插入
   * ```typescript
   * // 拖拽结束，插入节点
   * dragon.onDrop((dragNode, dropLocation) => {
   *   const { target, index } = dropLocation;
   *   const refNode = target.children?.get(index);
   *
   *   target.insertBefore(dragNode, refNode, true);  // 触发联动
   * });
   * ```
   *
   * ⚠️ 注意事项：
   *
   * 1. ref 必须是当前节点的子节点：
   * ```typescript
   * // ✅ 正确：
   * container.insertBefore(newNode, container.children.get(0));
   *
   * // ❌ 错误：ref 不是 container 的子节点
   * container.insertBefore(newNode, otherContainer.children.get(0));
   * // 结果：可能插入到错误位置或报错
   * ```
   *
   * 2. 自动从旧位置移除：
   * ```typescript
   * // newNode 已经在 container1 中
   * container2.insertBefore(newNode, ref);
   *
   * // 自动发生：
   * // 1. newNode 从 container1 移除
   * // 2. newNode 插入到 container2
   * // 不需要手动先移除
   * ```
   *
   * 3. ref 为 null/undefined 的行为：
   * ```typescript
   * insertBefore(node, null);
   * // -> index = null
   * // -> 插入到开头（NodeChildren 的行为）
   * ```
   *
   * @example
   * ```typescript
   * // 完整示例：调整节点顺序
   *
   * // 初始状态：
   * // Container
   * // ├── Button1
   * // ├── Button2
   * // └── Button3
   *
   * // 将 Button3 移到 Button1 前面
   * const button3 = container.children.get(2);
   * const button1 = container.children.get(0);
   * container.insertBefore(button3, button1);
   *
   * // 结果：
   * // Container
   * // ├── Button3   <- 移动到这里
   * // ├── Button1
   * // └── Button2
   * ```
   */
  insertBefore(node: INode, ref?: INode, useMutator = true) {
    // 确保 node 是 Node 实例（可能是 Schema 或其他文档的节点）
    const nodeInstance = ensureNode(node, this.document);

    // 调用 children 的内部插入方法
    // - nodeInstance: 要插入的节点
    // - ref ? ref.index : null: 插入位置（ref 的索引或 null）
    // - useMutator: 是否触发联动
    this.children?.internalInsert(nodeInstance, ref ? ref.index : null, useMutator);
  }

  insertAfter(node: any, ref?: INode, useMutator = true) {
    const nodeInstance = ensureNode(node, this.document);
    this.children?.internalInsert(nodeInstance, ref ? (ref.index || 0) + 1 : null, useMutator);
  }

  getParent() {
    return this.parent;
  }

  getId() {
    return this.id;
  }

  getIndex() {
    return this.index;
  }

  getNode() {
    return this;
  }

  getRoot() {
    return this.document.rootNode;
  }

  getProps() {
    return this.props;
  }

  onChildrenChange(fn: (param?: { type: string; node: INode }) => void): IPublicTypeDisposable | undefined {
    const wrappedFunc = wrapWithEventSwitch(fn);
    return this.children?.onChange(wrappedFunc);
  }

  mergeChildren(
    remover: (node: INode, idx: number) => any,
    adder: (children: INode[]) => IPublicTypeNodeData[] | null,
    sorter: (firstNode: INode, secondNode: INode) => any,
  ) {
    this.children?.mergeChildren(remover, adder, sorter);
  }

  /**
   * @deprecated
   */
  getStatus(field?: keyof NodeStatus) {
    if (field && this.status[field] != null) {
      return this.status[field];
    }

    return this.status;
  }

  /**
   * @deprecated
   */
  setStatus(field: keyof NodeStatus, flag: boolean) {
    if (!this.status.hasOwnProperty(field)) {
      return;
    }

    if (flag !== this.status[field]) {
      this.status[field] = flag;
    }
  }

  /**
   * @deprecated
   */
  getDOMNode(): any {
    const instance = this.document.simulator?.getComponentInstances(this)?.[0];
    if (!instance) {
      return;
    }
    return this.document.simulator?.findDOMNodes(instance)?.[0];
  }

  /**
   * @deprecated
   */
  getPage() {
    console.warn('getPage is deprecated, use document instead');
    return this.document;
  }

  /**
   * 获取磁贴相关信息
   */
  getRGL(): {
    isContainerNode: boolean;
    isEmptyNode: boolean;
    isRGLContainerNode: boolean;
    isRGLNode: boolean;
    isRGL: boolean;
    rglNode: Node | null;
  } {
    const isContainerNode = this.isContainer();
    const isEmptyNode = this.isEmpty();
    const isRGLContainerNode = this.isRGLContainer;
    const isRGLNode = (this.getParent()?.isRGLContainer) as boolean;
    const isRGL = isRGLContainerNode || (isRGLNode && (!isContainerNode || !isEmptyNode));
    let rglNode = isRGLContainerNode ? this : isRGL ? this?.getParent() : null;
    return { isContainerNode, isEmptyNode, isRGLContainerNode, isRGLNode, isRGL, rglNode };
  }

  /**
   * @deprecated no one is using this, will be removed in a future release
   */
  getSuitablePlace(node: INode, ref: any): any {
    const focusNode = this.document?.focusNode;
    // 如果节点是模态框，插入到根节点下
    if (node?.componentMeta?.isModal) {
      return { container: focusNode, ref };
    }

    if (!ref && focusNode && this.contains(focusNode)) {
      const rootCanDropIn = focusNode.componentMeta?.prototype?.options?.canDropIn;
      if (
        rootCanDropIn === undefined ||
        rootCanDropIn === true ||
        (typeof rootCanDropIn === 'function' && rootCanDropIn(node))
      ) {
        return { container: focusNode };
      }

      return null;
    }

    if (this.isRoot() && this.children) {
      const dropElement = this.children.filter((c) => {
        if (!c.isContainerNode) {
          return false;
        }
        const canDropIn = c.componentMeta?.prototype?.options?.canDropIn;
        if (
          canDropIn === undefined ||
          canDropIn === true ||
          (typeof canDropIn === 'function' && canDropIn(node))
        ) {
          return true;
        }
        return false;
      })[0];

      if (dropElement) {
        return { container: dropElement, ref };
      }

      const rootCanDropIn = this.componentMeta?.prototype?.options?.canDropIn;
      if (
        rootCanDropIn === undefined ||
        rootCanDropIn === true ||
        (typeof rootCanDropIn === 'function' && rootCanDropIn(node))
      ) {
        return { container: this, ref };
      }

      return null;
    }

    const canDropIn = this.componentMeta?.prototype?.options?.canDropIn;
    if (this.isContainer()) {
      if (
        canDropIn === undefined ||
        (typeof canDropIn === 'boolean' && canDropIn) ||
        (typeof canDropIn === 'function' && canDropIn(node))
      ) {
        return { container: this, ref };
      }
    }

    if (this.parent) {
      return this.parent.getSuitablePlace(node, { index: this.index });
    }

    return null;
  }

  /**
   * @deprecated
   */
  getAddonData(key: string) {
    const addon = this._addons[key];
    if (addon) {
      return addon.exportData();
    }
    return this.getExtraProp(key)?.getValue();
  }

  /**
   * @deprecated
   */
  registerAddon(key: string, exportData: () => any, isProp = false) {
    this._addons[key] = { exportData, isProp };
  }

  getRect(): DOMRect | null {
    if (this.isRoot()) {
      return this.document.simulator?.viewport.contentBounds || null;
    }
    return this.document.simulator?.computeRect(this) || null;
  }

  /**
   * @deprecated
   */
  getPrototype() {
    return this.componentMeta.prototype;
  }

  /**
   * @deprecated
   */
  setPrototype(proto: any) {
    this.componentMeta.prototype = proto;
  }

  getIcon() {
    return this.icon;
  }

  toString() {
    return this.id;
  }

  emitPropChange(val: IPublicTypePropChangeOptions) {
    this.emitter?.emit('propChange', val);
  }

  onPropChange(func: (info: IPublicTypePropChangeOptions) => void): IPublicTypeDisposable {
    const wrappedFunc = wrapWithEventSwitch(func);
    this.emitter.on('propChange', wrappedFunc);
    return () => {
      this.emitter.removeListener('propChange', wrappedFunc);
    };
  }
}

function ensureNode(node: any, document: IDocumentModel): INode {
  let nodeInstance = node;
  if (!isNode(node)) {
    if (node.getComponentName) {
      nodeInstance = document.createNode({
        componentName: node.getComponentName(),
      });
    } else {
      nodeInstance = document.createNode(node);
    }
  }
  return nodeInstance;
}

export interface LeafNode extends Node {
  readonly children: null;
}

export type IPublicTypePropChangeOptions = Omit<GlobalEvent.Node.Prop.ChangeOptions, 'node'>;

export type ISlotNode = IBaseNode<IPublicTypeSlotSchema>;
export type IPageNode = IBaseNode<IPublicTypePageSchema>;
export type IComponentNode = IBaseNode<IPublicTypeComponentSchema>;
export type IRootNode = IPageNode | IComponentNode;
export type INode = IPageNode | ISlotNode | IComponentNode | IRootNode;

export function isRootNode(node: INode): node is IRootNode {
  return node && node.isRootNode;
}

export function isLowCodeComponent(node: INode): node is IComponentNode {
  return node.componentMeta?.getMetadata().devMode === 'lowCode';
}

export function getZLevelTop(child: INode, zLevel: number): INode | null {
  let l = child.zLevel;
  if (l < zLevel || zLevel < 0) {
    return null;
  }
  if (l === zLevel) {
    return child;
  }
  let r: any = child;
  while (r && l-- > zLevel) {
    r = r.parent;
  }
  return r;
}

/**
 * 测试两个节点是否为包含关系
 * @param node1 测试的父节点
 * @param node2 测试的被包含节点
 * @returns 是否包含
 */
export function contains(node1: INode, node2: INode): boolean {
  if (node1 === node2) {
    return true;
  }

  if (!node1.isParentalNode || !node2.parent) {
    return false;
  }

  const p = getZLevelTop(node2, node1.zLevel);
  if (!p) {
    return false;
  }

  return node1 === p;
}

// 16 node1 contains node2
// 8  node1 contained_by node2
// 2  node1 before or after node2
// 0  node1 same as node2
export enum PositionNO {
  Contains = 16,
  ContainedBy = 8,
  BeforeOrAfter = 2,
  TheSame = 0,
}
export function comparePosition(node1: INode, node2: INode): PositionNO {
  if (node1 === node2) {
    return PositionNO.TheSame;
  }
  const l1 = node1.zLevel;
  const l2 = node2.zLevel;
  if (l1 === l2) {
    return PositionNO.BeforeOrAfter;
  }

  let p: any;
  if (l1 < l2) {
    p = getZLevelTop(node2, l1);
    if (p && p === node1) {
      return PositionNO.Contains;
    }
    return PositionNO.BeforeOrAfter;
  }

  p = getZLevelTop(node1, l2);
  if (p && p === node2) {
    return PositionNO.ContainedBy;
  }

  return PositionNO.BeforeOrAfter;
}

// 🔥 【步骤2】插入单个子节点的核心函数
// 这个函数负责处理不同类型的 thing（现有节点、节点数据）转换为实际节点并插入
export function insertChild(
  container: INode,                        // 目标父容器节点
  thing: INode | IPublicTypeNodeData,      // 要插入的内容：现有节点 或 节点数据(Schema)
  at?: number | null,                      // 插入位置索引，null 表示末尾
  copy?: boolean,                          // 是否复制模式（true=复制，false=移动）
): INode | null {
  let node: INode | null | IRootNode | undefined; // 最终要插入的节点实例
  let nodeSchema: IPublicTypeNodeSchema;          // 节点 Schema 数据

  // 🎯 情况1：thing 是现有节点 且 需要复制 或 是插槽节点
  if (isNode<INode>(thing) && (copy || thing.isSlot())) {
    // 导出节点的 Schema（克隆阶段，包含所有属性和子节点）
    nodeSchema = thing.export(IPublicEnumTransformStage.Clone);
    // 🔥 【步骤4】调用 document.createNode 创建新的节点实例
    node = container.document?.createNode(nodeSchema);
  }
  // 🎯 情况2：thing 是现有节点 且 是移动模式（非复制、非插槽）
  else if (isNode<INode>(thing)) {
    // 直接使用现有节点，不需要创建新实例
    node = thing;
  }
  // 🎯 情况3：thing 是节点数据(Schema) - 🔥 组件库拖拽走这个分支
  else if (isNodeSchema(thing)) {
    // 🔥 【步骤4】根据 Schema 数据创建新的节点实例
    // 这是组件库拖拽的关键步骤：NodeData -> Node 实例
    node = container.document?.createNode(thing);
  }

  // 如果成功获得了有效的节点实例
  if (isNode<INode>(node)) {
    // 🔥 【步骤3】调用容器的 children.insert 方法将节点插入到指定位置
    // 这里会触发 NodeChildren.insert -> NodeChildren.internalInsert
    container.children?.insert(node, at);
    return node; // 返回成功插入的节点
  }

  return null; // 插入失败，返回 null
}

// 🔥 【步骤2】批量插入子节点的函数 - Designer.onDragend 直接调用
// 负责将多个节点或节点数据按顺序插入到指定容器中
export function insertChildren(
  container: INode,                        // 目标父容器节点
  nodes: INode[] | IPublicTypeNodeData[],  // 要插入的节点数组：现有节点数组 或 Schema数据数组
  at?: number | null,                      // 起始插入位置索引
  copy?: boolean,                          // 是否复制模式
): INode[] {
  let index = at;                          // 当前插入位置，会随着插入过程递增
  let node: any;                           // 当前处理的节点
  const results: INode[] = [];             // 存储成功插入的节点实例数组

  // 🔄 从数组末尾开始逐个弹出并处理（保证插入顺序正确）
  // 使用 while + pop() 的方式是为了确保多个节点按正确顺序插入
  // eslint-disable-next-line no-cond-assign
  while ((node = nodes.pop())) {
    // 🔥 【核心调用】对每个节点调用 insertChild 进行单个插入
    // 这里会处理 NodeData -> Node 的转换（如果需要）
    node = insertChild(container, node, index, copy);

    // 将成功插入的节点添加到结果数组
    results.push(node);

    // 📍 更新下一个节点的插入位置
    // 使用刚插入节点的实际索引，确保后续节点插入在正确位置
    index = node.index;
  }

  // 返回所有成功插入的节点实例数组
  // 这个数组会被 Designer.onDragend 用于后续的选中操作
  return results;
}
