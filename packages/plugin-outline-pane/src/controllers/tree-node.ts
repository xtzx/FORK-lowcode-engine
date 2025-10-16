/**
 * @file TreeNode 树节点类
 * @description 大纲树中的单个节点模型，是设计器 Node 的视图层封装
 *
 * 核心职责：
 * 1. 封装设计器节点（IPublicModelNode）
 * 2. 管理节点的UI状态（展开、选中、过滤等）
 * 3. 提供节点操作方法（展开、折叠、选中、删除等）
 * 4. 发送节点状态变化事件
 *
 * 设计器节点 vs 树节点：
 * ```
 * IPublicModelNode（设计器节点）：
 * - 数据模型，表示 Schema 中的一个节点
 * - 包含组件信息、属性、子节点等
 * - 设计器核心层维护
 *
 * TreeNode（树节点）：
 * - 视图模型，用于大纲树显示
 * - 包含UI状态：展开/折叠、过滤结果等
 * - 大纲树插件维护
 *
 * 关系：
 * - TreeNode 包装 IPublicModelNode
 * - 一个 IPublicModelNode 对应一个 TreeNode
 * - TreeNode 提供大纲树特有的功能
 * ```
 *
 * 核心状态：
 * - expanded: 是否展开
 * - selected: 是否选中
 * - hidden: 是否隐藏
 * - locked: 是否锁定
 * - filtering: 过滤结果
 *
 * 事件系统：
 * - 状态变化时发送事件
 * - 视图监听事件并更新
 * - 实现响应式更新
 *
 * @example
 * ```typescript
 * // 创建树节点
 * const treeNode = new TreeNode(tree, designerNode);
 *
 * // 展开节点
 * treeNode.expand();
 *
 * // 监听展开变化
 * treeNode.onExpandedChanged((expanded) => {
 *   console.log('节点展开状态：', expanded);
 * });
 *
 * // 选中节点
 * treeNode.select(false);
 *
 * // 锁定节点
 * treeNode.setLocked(true);
 * ```
 */

import {
  IPublicTypeTitleContent,  // 标题内容类型
  IPublicTypeLocationChildrenDetail,  // 子节点位置详情
  IPublicModelNode,  // 设计器节点模型
  IPublicTypeDisposable,  // 可清理对象类型
} from '@alilc/lowcode-types';
import { isI18nData, isLocationChildrenDetail, uniqueId } from '@alilc/lowcode-utils';
import EventEmitter from 'events';  // Node.js 事件触发器
import { Tree } from './tree';  // 树模型
import { IOutlinePanelPluginContext } from './tree-master';  // 插件上下文接口

// ==================== 过滤结果接口 ====================
/**
 * 大纲树过滤结果接口
 *
 * 用于表示节点的过滤匹配状态
 *
 * 字段说明：
 * - filterWorking: 过滤功能是否启用
 * - matchChild: 子节点是否命中过滤条件
 * - matchSelf: 节点自身是否命中过滤条件
 * - keywords: 过滤关键字
 *
 * 过滤逻辑：
 * ```typescript
 * // 节点显示条件：
 * if (!filterWorking) {
 *   显示所有节点
 * } else if (matchSelf || matchChild) {
 *   显示节点（自己或子节点命中）
 * } else {
 *   隐藏节点
 * }
 * ```
 *
 * 使用场景：
 * - 用户在过滤框输入"Button"
 * - 匹配所有包含"Button"的节点
 * - matchSelf=true: 节点名称包含"Button"
 * - matchChild=true: 子节点包含"Button"
 */
export interface FilterResult {
  filterWorking: boolean;  // 过滤条件是否生效
  matchChild: boolean;  // 命中子节点
  matchSelf: boolean;  // 命中本节点
  keywords: string;  // 关键字
}

// ==================== 事件名称枚举 ====================
/**
 * TreeNode 内部事件名称
 *
 * 用途：
 * - 定义节点状态变化的事件名称
 * - 避免硬编码字符串
 * - 提供类型安全
 *
 * 事件列表：
 * - filterResultChanged: 过滤结果变化
 * - expandedChanged: 展开状态变化
 * - hiddenChanged: 显示/隐藏状态变化
 * - lockedChanged: 锁定状态变化
 * - titleLabelChanged: 标题变化
 * - expandableChanged: 可展开性变化
 * - conditionChanged: 条件渲染变化
 */
enum EVENT_NAMES {
  filterResultChanged = 'filterResultChanged',
  expandedChanged = 'expandedChanged',
  hiddenChanged = 'hiddenChanged',
  lockedChanged = 'lockedChanged',
  titleLabelChanged = 'titleLabelChanged',
  expandableChanged = 'expandableChanged',
  conditionChanged = 'conditionChanged',
}

// ==================== TreeNode 类 ====================
/**
 * 树节点类
 *
 * 职责：
 * - 封装设计器节点
 * - 管理 UI 状态
 * - 提供操作方法
 * - 发送状态事件
 */
export default class TreeNode {
  // ========== 只读属性 ==========

  /**
   * 插件上下文引用
   *
   * 用途：
   * - 访问编辑器 API（project、selection 等）
   * - 调用国际化方法
   * - 获取配置
   */
  readonly pluginContext: IOutlinePanelPluginContext;

  /**
   * 事件触发器
   *
   * 用途：
   * - 发送节点状态变化事件
   * - 供视图层监听和响应
   *
   * 使用 Node.js EventEmitter：
   * - emit: 发送事件
   * - on: 监听事件
   * - off: 取消监听
   */
  event = new EventEmitter();

  // ========== 私有属性：设计器节点 ==========
  /**
   * 设计器节点引用
   *
   * 类型：IPublicModelNode
   *
   * 说明：
   * - TreeNode 是 IPublicModelNode 的包装
   * - 通过 this.node getter 访问
   * - 私有属性，防止外部直接修改
   */
  private _node: IPublicModelNode;

  /**
   * 树模型引用
   *
   * 用途：
   * - 获取其他树节点
   * - 访问树的全局方法
   * - 树的上下文信息
   */
  readonly tree: Tree;

  // ========== 私有属性：过滤结果 ==========
  /**
   * 节点的过滤匹配结果
   *
   * 默认值：
   * - filterWorking: false（过滤未启用）
   * - matchChild: false（子节点未命中）
   * - matchSelf: false（自身未命中）
   * - keywords: ''（无关键字）
   *
   * 更新时机：
   * - 用户输入过滤关键字
   * - 节点树结构变化
   * - 调用 setFilterResult()
   */
  private _filterResult: FilterResult = {
    filterWorking: false,
    matchChild: false,
    matchSelf: false,
    keywords: '',
  };

  // ========== 私有属性：展开状态 ==========
  /**
   * 节点是否展开
   *
   * 默认值：false（折叠状态）
   *
   * 特殊情况：
   * - 根节点在初始化时设置为 true
   * - 通过 setExpanded() 修改
   *
   * 为什么默认折叠？
   * - 节点树可能很大，全部展开影响性能
   * - 折叠状态让用户聚焦当前操作
   * - 根节点展开以显示顶层结构
   */
  private _expanded = false;

  /**
   * TreeNode 的唯一 ID
   *
   * 用途：
   * - React key（渲染列表时使用）
   * - 调试标识
   *
   * 注意：
   * - 与 nodeId（设计器节点ID）不同
   * - TreeNode 的 ID 是临时的
   * - nodeId 是持久的
   */
  id = uniqueId('treeNode');

  // ========== 计算属性：节点ID ==========
  /**
   * 获取设计器节点的 ID
   *
   * @returns 节点 ID
   *
   * 用途：
   * - 关联树节点和设计器节点
   * - 在设计器中查找节点
   */
  get nodeId(): string {
    return this.node.id;
  }

  // ========== 计算属性：是否可展开 ==========
  /**
   * 判断节点是否可以展开
   *
   * @returns true - 可展开，false - 不可展开
   *
   * 可展开的条件（满足任一）：
   * 1. 有子节点（hasChildren）
   * 2. 有插槽（hasSlots）
   * 3. 正在拖拽且有插入位置（dropDetail）
   *
   * 特殊情况：
   * - 锁定的节点不可展开
   *
   * 为什么拖拽时也可展开？
   * - 拖拽时节点可能暂时没有子节点
   * - 但用户可能要拖入子节点
   * - 需要展开以显示插入位置
   */
  get expandable(): boolean {
    if (this.locked) return false;  // 锁定节点不可展开
    return this.hasChildren() || this.hasSlots() || this.dropDetail?.index != null;
  }

  /**
   * 获取节点展开状态
   *
   * @returns true - 展开，false - 折叠
   *
   * 逻辑：
   * - 根节点：始终展开
   * - 其他节点：可展开 且 _expanded 为 true
   *
   * 为什么根节点始终展开？
   * - 根节点折叠会隐藏整个树
   * - 用户需要看到顶层结构
   */
  get expanded(): boolean {
    return this.isRoot(true) || (this.expandable && this._expanded);
  }

  // ========== 计算属性：插入位置详情 ==========
  /**
   * 获取当前拖拽的插入位置详情
   *
   * @returns 位置详情或 null
   *
   * 返回条件（必须同时满足）：
   * 1. 有拖放位置（dropLocation）
   * 2. 当前节点是拖放目标
   * 3. 位置类型是 Children
   *
   * 用途：
   * - 在拖拽时显示插入线
   * - 判断插入位置
   *
   * 插入线示例：
   * ```
   * Container
   * ├─ Button1
   * ├─ ━━━━━━  <- 插入线（dropDetail.index = 2）
   * └─ Button2
   * ```
   */
  get dropDetail(): IPublicTypeLocationChildrenDetail | undefined | null {
    const loc = this.pluginContext.project.getCurrentDocument()?.dropLocation;
    return loc && this.isResponseDropping() && isLocationChildrenDetail(loc.detail) ? loc.detail : null;
  }

  /**
   * 获取节点深度（层级）
   *
   * @returns 节点深度（从 0 开始）
   *
   * 说明：
   * - 使用 node.zLevel（Z轴层级）
   * - 0: 根节点
   * - 1: 根节点的直接子节点
   * - 2: 第二层子节点
   * - ...
   *
   * 用途：
   * - 计算缩进距离（depth * 16px）
   * - 判断层级关系
   */
  get depth(): number {
    return this.node.zLevel;
  }

  /**
   * 是否正在检测中
   *
   * @returns true - 检测中，false - 未检测
   *
   * 检测状态：
   * - 拖拽悬停时的高亮状态
   * - 用于视觉反馈
   *
   * 使用场景：
   * ```typescript
   * // 拖拽悬停在节点上
   * if (treeNode.detecting) {
   *   // 添加高亮样式
   *   className += ' detecting';
   * }
   * ```
   */
  get detecting() {
    const doc = this.pluginContext.project.currentDocument;
    return !!(doc?.isDetectingNode(this.node));
  }

  /**
   * 是否隐藏
   *
   * @returns true - 隐藏，false - 显示
   *
   * 逻辑：
   * - 先检查条件渲染（conditionalVisible）
   * - 如果有条件渲染，使用条件结果
   * - 如果无条件渲染，使用 visible 属性
   *
   * 条件渲染 vs 普通显示/隐藏：
   * - conditionalVisible: 通过条件表达式控制
   * - visible: 直接控制显示/隐藏
   * - 条件渲染优先级更高
   */
  get hidden(): boolean {
    const cv = this.node.isConditionalVisible();
    if (cv == null) {
      // 无条件渲染，使用 visible
      return !this.node.visible;
    }
    // 有条件渲染，使用条件结果
    return !cv;
  }

  /**
   * 是否锁定
   *
   * @returns true - 锁定，false - 未锁定
   *
   * 锁定效果：
   * - 不能拖拽
   * - 不能删除
   * - 不能编辑属性
   * - 子节点也被锁定
   */
  get locked(): boolean {
    return this.node.isLocked;
  }

  /**
   * 是否选中
   *
   * @returns true - 选中，false - 未选中
   *
   * 实现：
   * - 从文档的 selection 管理器查询
   * - 使用 selection.has(nodeId) 判断
   *
   * TODO: 拖拽时的特殊处理
   * - 拖拽时可能需要取消选中状态
   * - 避免视觉混淆
   */
  get selected(): boolean {
    // TODO: check is dragging
    const selection = this.pluginContext.project.getCurrentDocument()?.selection;
    if (!selection) {
      return false;
    }
    return selection?.has(this.node.id);
  }

  /**
   * 获取节点标题
   *
   * @returns 标题内容
   *
   * 标题类型：
   * - 字符串
   * - 国际化对象
   * - React 元素
   */
  get title(): IPublicTypeTitleContent {
    return this.node.title;
  }

  /**
   * 获取标题文本
   *
   * @returns 标题字符串
   *
   * 处理逻辑（按优先级）：
   * 1. 如果 title 为空 -> 返回空字符串
   * 2. 如果 title.label 存在 -> 使用 label
   * 3. 如果 title 是字符串 -> 直接返回
   * 4. 如果 title 是国际化对象 -> 返回当前语言的文案
   * 5. 否则 -> 返回组件名称
   *
   * 为什么有这么多判断？
   * - 支持多种标题格式
   * - 向后兼容
   * - 提供降级方案
   *
   * 标题格式示例：
   * ```typescript
   * // 格式1：字符串
   * title = "我的按钮"
   *
   * // 格式2：国际化对象
   * title = {
   *   'zh-CN': '按钮',
   *   'en-US': 'Button'
   * }
   *
   * // 格式3：带 label 的对象
   * title = {
   *   label: "主要按钮",
   *   icon: 'button'
   * }
   * ```
   */
  get titleLabel() {
    let { title } = this;

    // 1. 空标题
    if (!title) {
      return '';
    }

    // 2. 提取 label（如果有）
    if ((title as any).label) {
      title = (title as any).label;
    }

    // 3. 字符串标题
    if (typeof title === 'string') {
      return title;
    }

    // 4. 国际化标题
    if (isI18nData(title)) {
      const currentLocale = this.pluginContext.getLocale();
      const currentTitle = title[currentLocale];
      return currentTitle;
    }

    // 5. 降级：使用组件名称
    return this.node.componentName;
  }

  /**
   * 获取节点图标
   *
   * @returns 图标组件或 undefined
   *
   * 说明：
   * - 从组件元数据获取图标
   * - 不同组件有不同的图标
   *
   * 使用场景：
   * ```tsx
   * {treeNode.icon && <Icon component={treeNode.icon} />}
   * ```
   */
  get icon() {
    return this.node.componentMeta?.icon;
  }

  /**
   * 获取父节点
   *
   * @returns 父 TreeNode 或 null
   *
   * 实现：
   * - 获取设计器节点的 parent
   * - 转换为 TreeNode
   *
   * 为什么返回 TreeNode 而不是 IPublicModelNode？
   * - 保持类型一致
   * - TreeNode 包含 UI 状态
   * - 便于链式操作
   */
  get parent(): TreeNode | null {
    const { parent } = this.node;
    if (parent) {
      return this.tree.getTreeNode(parent);
    }
    return null;
  }

  /**
   * 获取插槽节点列表
   *
   * @returns TreeNode 数组
   *
   * 插槽说明：
   * - 某些组件有插槽（Slot）
   * - 插槽是特殊的子节点
   * - 用于内容分发
   *
   * 示例：
   * ```
   * Dialog 组件：
   * ├─ header (插槽)
   * ├─ body (插槽)
   * └─ footer (插槽)
   * ```
   *
   * TODO: shallowEqual 优化
   * - 当前每次都创建新数组
   * - 可以使用浅比较优化
   */
  get slots(): TreeNode[] {
    // todo: shallowEqual
    return this.node.slots.map((node) => this.tree.getTreeNode(node));
  }

  /**
   * 是否有条件渲染
   *
   * @returns true - 有条件渲染，false - 无
   *
   * 条件渲染：
   * - 根据表达式决定是否显示
   * - 类似 Vue 的 v-if
   *
   * 判断条件：
   * - node.hasCondition(): 节点有条件配置
   * - !node.conditionGroup: 不是条件组（条件组是容器，不显示标识）
   *
   * 视觉标识：
   * ```
   * Button [条件] <- 显示条件图标
   * ```
   */
  get condition(): boolean {
    return this.node.hasCondition() && !this.node.conditionGroup;
  }

  /**
   * 获取子节点列表
   *
   * @returns TreeNode 数组或 null
   *
   * 实现：
   * - 将设计器节点的 children 映射为 TreeNode
   * - 如果无子节点，返回 null
   *
   * 为什么返回 null 而不是空数组？
   * - 区分"没有子节点"和"有0个子节点"
   * - null: 节点不是容器，不支持子节点
   * - []: 节点是容器，但当前没有子节点
   */
  get children(): TreeNode[] | null {
    return this.node.children?.map((node) => this.tree.getTreeNode(node)) || null;
  }

  /**
   * 获取设计器节点
   *
   * @returns IPublicModelNode
   *
   * 用途：
   * - 访问底层节点数据
   * - 调用节点方法
   */
  get node(): IPublicModelNode {
    return this._node;
  }

  // ========== 构造函数 ==========
  /**
   * 构造 TreeNode 实例
   *
   * @param tree - 树模型引用
   * @param node - 设计器节点
   *
   * 初始化：
   * - 保存树引用
   * - 保存插件上下文（从 tree 获取）
   * - 保存节点引用
   */
  constructor(tree: Tree, node: IPublicModelNode) {
    this.tree = tree;
    this.pluginContext = tree.pluginContext;
    this._node = node;
  }

  // ========== 公开方法：设置锁定状态 ==========
  /**
   * 设置节点锁定状态
   *
   * @param flag - true 锁定，false 解锁
   *
   * 功能：
   * - 调用设计器节点的 lock 方法
   * - 发送锁定状态变化事件
   *
   * 锁定效果：
   * - 不能拖拽
   * - 不能删除
   * - 不能编辑属性
   * - 子节点继承锁定状态
   */
  setLocked(flag: boolean) {
    this.node.lock(flag);  // 调用设计器方法
    this.event.emit(EVENT_NAMES.lockedChanged, flag);  // 发送事件
  }

  /**
   * 删除节点
   *
   * @param node - 要删除的设计器节点
   *
   * 功能：
   * - 调用设计器节点的 remove 方法
   * - 从文档中移除节点
   *
   * 注意：
   * - 参数是 IPublicModelNode 而不是 TreeNode
   * - 直接操作设计器层
   */
  deleteNode(node: IPublicModelNode) {
    node && node.remove();
  }

  // ========== 事件监听方法 ==========

  /**
   * 监听过滤结果变化
   *
   * @param fn - 回调函数
   * @returns 清理函数
   *
   * 使用模式：
   * ```typescript
   * const dispose = treeNode.onFilterResultChanged(() => {
   *   // 过滤结果变化，更新视图
   *   forceUpdate();
   * });
   *
   * // 组件卸载时清理
   * return () => dispose();
   * ```
   */
  onFilterResultChanged(fn: () => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.filterResultChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.filterResultChanged, fn);
    };
  }

  /**
   * 监听展开状态变化
   *
   * @param fn - 回调函数，接收新的展开状态
   * @returns 清理函数
   */
  onExpandedChanged(fn: (expanded: boolean) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.expandedChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.expandedChanged, fn);
    };
  }

  /**
   * 监听显示/隐藏状态变化
   *
   * @param fn - 回调函数，接收新的隐藏状态
   * @returns 清理函数
   */
  onHiddenChanged(fn: (hidden: boolean) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.hiddenChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.hiddenChanged, fn);
    };
  }

  /**
   * 监听锁定状态变化
   *
   * @param fn - 回调函数，接收新的锁定状态
   * @returns 清理函数
   */
  onLockedChanged(fn: (locked: boolean) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.lockedChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.lockedChanged, fn);
    };
  }

  /**
   * 监听标题变化
   *
   * @param fn - 回调函数，接收 TreeNode 实例
   * @returns 清理函数
   */
  onTitleLabelChanged(fn: (treeNode: TreeNode) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.titleLabelChanged, fn);

    return () => {
      this.event.off(EVENT_NAMES.titleLabelChanged, fn);
    };
  }

  /**
   * 监听条件渲染变化
   *
   * @param fn - 回调函数，接收 TreeNode 实例
   * @returns 清理函数
   */
  onConditionChanged(fn: (treeNode: TreeNode) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.conditionChanged, fn);

    return () => {
      this.event.off(EVENT_NAMES.conditionChanged, fn);
    };
  }

  /**
   * 监听可展开性变化
   *
   * @param fn - 回调函数，接收新的可展开状态
   * @returns 清理函数
   *
   * 触发时机：
   * - 节点从无子节点变为有子节点
   * - 节点从有子节点变为无子节点
   * - 节点锁定/解锁状态变化
   */
  onExpandableChanged(fn: (expandable: boolean) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.expandableChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.expandableChanged, fn);
    };
  }

  // ========== 事件通知方法 ==========

  /**
   * 通知可展开性变化
   *
   * 调用时机：
   * - 子节点增删
   * - 插槽变化
   * - 锁定状态变化
   *
   * 功能：
   * - 发送 expandableChanged 事件
   * - 视图更新展开按钮状态
   */
  notifyExpandableChanged(): void {
    this.event.emit(EVENT_NAMES.expandableChanged, this.expandable);
  }

  /**
   * 通知标题变化
   *
   * 调用时机：
   * - 用户编辑节点标题
   * - 标题属性变化
   */
  notifyTitleLabelChanged(): void {
    this.event.emit(EVENT_NAMES.titleLabelChanged, this.title);
  }

  /**
   * 通知条件渲染变化
   *
   * 调用时机：
   * - 添加/移除条件配置
   * - 条件表达式变化
   */
  notifyConditionChanged(): void {
    this.event.emit(EVENT_NAMES.conditionChanged, this.condition);
  }

  // ========== 公开方法：设置隐藏状态 ==========
  /**
   * 设置节点显示/隐藏
   *
   * @param flag - true 隐藏，false 显示
   *
   * 功能：
   * - 修改设计器节点的 visible 属性
   * - 发送 hiddenChanged 事件
   *
   * 特殊处理：
   * - 条件组节点不能设置隐藏
   * - 避免重复设置（性能优化）
   *
   * 为什么条件组不能设置？
   * - 条件组是逻辑容器，不直接渲染
   * - 显示/隐藏应该修改条件表达式
   */
  setHidden(flag: boolean) {
    // 条件组节点不允许设置隐藏
    if (this.node.conditionGroup) {
      return;
    }

    // 避免重复设置（性能优化）
    if (this.node.visible !== !flag) {
      this.node.visible = !flag;
    }

    // 发送事件
    this.event.emit(EVENT_NAMES.hiddenChanged, flag);
  }

  // ========== 公开方法：判断是否是焦点节点 ==========
  /**
   * 判断当前节点是否是拖拽的焦点节点
   *
   * @returns true - 是焦点节点，false - 不是
   *
   * 焦点节点：
   * - 拖拽时鼠标悬停的节点
   * - 用于停留展开（DwellTimer）
   *
   * 判断条件：
   * - 有拖放位置
   * - detail 是 Children 类型
   * - focus.type 是 'node'
   * - focus.node.id 等于当前节点ID
   *
   * 视觉效果：
   * - 焦点节点通常有特殊样式
   * - 提示用户当前悬停位置
   */
  isFocusingNode(): boolean {
    const loc = this.pluginContext.project.getCurrentDocument()?.dropLocation;
    if (!loc) {
      return false;
    }
    return (
      isLocationChildrenDetail(loc.detail) &&
      loc.detail.focus?.type === 'node' &&
      loc.detail?.focus?.node.id === this.nodeId
    );
  }

  // ========== 公开方法：设置展开状态 ==========
  /**
   * 设置节点展开状态
   *
   * @param value - true 展开，false 折叠
   *
   * 功能：
   * - 修改 _expanded 属性
   * - 发送 expandedChanged 事件
   *
   * 注意：
   * - 不检查 expandable
   * - 调用者需要自行检查
   */
  setExpanded(value: boolean) {
    this._expanded = value;
    this.event.emit(EVENT_NAMES.expandedChanged, value);
  }

  // ========== 公开方法：判断是否是根节点 ==========
  /**
   * 判断是否是根节点
   *
   * @param includeOriginalRoot - 是否包括设计器的原始根节点
   * @returns true - 是根节点，false - 不是
   *
   * 两种根节点：
   * - tree.root: 树的根节点（可能不是设计器的根节点）
   * - document.root: 设计器的根节点
   *
   * 为什么要区分？
   * - 大纲树可能只显示部分子树
   * - tree.root 可能是某个容器节点
   * - 需要灵活判断
   */
  isRoot(includeOriginalRoot = false) {
    const rootNode = this.pluginContext.project.getCurrentDocument()?.root;
    return this.tree.root === this || (includeOriginalRoot && rootNode === this.node);
  }

  // ========== 公开方法：判断是否响应拖放 ==========
  /**
   * 判断当前节点是否是拖放的目标节点
   *
   * @returns true - 是目标，false - 不是
   *
   * 用途：
   * - 判断是否显示插入线
   * - 判断是否应用高亮样式
   *
   * 判断条件：
   * - 有拖放位置
   * - 拖放位置的 target 是当前节点
   */
  isResponseDropping(): boolean {
    const loc = this.pluginContext.project.getCurrentDocument()?.dropLocation;
    if (!loc) {
      return false;
    }
    return loc.target?.id === this.nodeId;
  }

  // ========== 公开方法：设置标题 ==========
  /**
   * 设置节点标题
   *
   * @param label - 新标题
   *
   * 功能：
   * - 修改节点的 title 额外属性
   * - 发送 titleLabelChanged 事件
   *
   * 特殊处理：
   * - 空字符串：移除 title 属性（恢复默认）
   * - 非空：设置 title 属性
   * - 相同标题：不处理（性能优化）
   *
   * 实现原理：
   * - 使用 ExtraProp 存储
   * - 不修改 Schema（保持纯净）
   * - 只影响显示
   */
  setTitleLabel(label: string) {
    const origLabel = this.titleLabel;

    // 相同标题，不处理
    if (label === origLabel) {
      return;
    }

    if (label === '') {
      // 空标题：移除额外属性
      this.node.getExtraProp('title', false)?.remove();
    } else {
      // 非空：设置额外属性
      this.node.getExtraProp('title', true)?.setValue(label);
    }

    // 发送事件
    this.event.emit(EVENT_NAMES.titleLabelChanged, this);
  }

  setLocked(flag: boolean) {
    this.node.lock(flag);
    this.event.emit(EVENT_NAMES.lockedChanged, flag);
  }
  deleteNode(node: IPublicModelNode) {
    node && node.remove();
  }
  onFilterResultChanged(fn: () => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.filterResultChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.filterResultChanged, fn);
    };
  }
  onExpandedChanged(fn: (expanded: boolean) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.expandedChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.expandedChanged, fn);
    };
  }
  onHiddenChanged(fn: (hidden: boolean) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.hiddenChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.hiddenChanged, fn);
    };
  }
  onLockedChanged(fn: (locked: boolean) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.lockedChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.lockedChanged, fn);
    };
  }

  onTitleLabelChanged(fn: (treeNode: TreeNode) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.titleLabelChanged, fn);

    return () => {
      this.event.off(EVENT_NAMES.titleLabelChanged, fn);
    };
  }

  onConditionChanged(fn: (treeNode: TreeNode) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.conditionChanged, fn);

    return () => {
      this.event.off(EVENT_NAMES.conditionChanged, fn);
    };
  }

  onExpandableChanged(fn: (expandable: boolean) => void): IPublicTypeDisposable {
    this.event.on(EVENT_NAMES.expandableChanged, fn);
    return () => {
      this.event.off(EVENT_NAMES.expandableChanged, fn);
    };
  }

  /**
   * 触发 onExpandableChanged 回调
   */
  notifyExpandableChanged(): void {
    this.event.emit(EVENT_NAMES.expandableChanged, this.expandable);
  }

  notifyTitleLabelChanged(): void {
    this.event.emit(EVENT_NAMES.titleLabelChanged, this.title);
  }

  notifyConditionChanged(): void {
    this.event.emit(EVENT_NAMES.conditionChanged, this.condition);
  }

  setHidden(flag: boolean) {
    if (this.node.conditionGroup) {
      return;
    }
    if (this.node.visible !== !flag) {
      this.node.visible = !flag;
    }
    this.event.emit(EVENT_NAMES.hiddenChanged, flag);
  }

  isFocusingNode(): boolean {
    const loc = this.pluginContext.project.getCurrentDocument()?.dropLocation;
    if (!loc) {
      return false;
    }
    return (
      isLocationChildrenDetail(loc.detail) && loc.detail.focus?.type === 'node' && loc.detail?.focus?.node.id === this.nodeId
    );
  }

  setExpanded(value: boolean) {
    this._expanded = value;
    this.event.emit(EVENT_NAMES.expandedChanged, value);
  }

  isRoot(includeOriginalRoot = false) {
    const rootNode = this.pluginContext.project.getCurrentDocument()?.root;
    return this.tree.root === this || (includeOriginalRoot && rootNode === this.node);
  }

  /**
   * 是否是响应投放区
   */
  isResponseDropping(): boolean {
    const loc = this.pluginContext.project.getCurrentDocument()?.dropLocation;
    if (!loc) {
      return false;
    }
    return loc.target?.id === this.nodeId;
  }

  setTitleLabel(label: string) {
    const origLabel = this.titleLabel;
    if (label === origLabel) {
      return;
    }
    if (label === '') {
      this.node.getExtraProp('title', false)?.remove();
    } else {
      this.node.getExtraProp('title', true)?.setValue(label);
    }
    this.event.emit(EVENT_NAMES.titleLabelChanged, this);
  }

  // ========== 公开方法：判断是否是容器 ==========
  /**
   * 判断节点是否是容器（可以包含子节点）
   *
   * @returns true - 是容器，false - 不是
   *
   * 容器节点：
   * - 可以拖入子节点
   * - 在大纲树中可以展开
   *
   * 示例：
   * - Container: 是容器
   * - Button: 不是容器（但可能是，取决于组件定义）
   * - Image: 不是容器
   */
  isContainer(): boolean {
    return this.node.isContainerNode;
  }

  /**
   * 判断是否有插槽
   *
   * @returns true - 有插槽，false - 无插槽
   *
   * 插槽节点：
   * - 用于内容分发
   * - 类似 Vue 的 slot
   *
   * 示例：
   * ```
   * Dialog 组件：
   * - header 插槽
   * - body 插槽
   * - footer 插槽
   * ```
   */
  hasSlots(): boolean {
    return this.node.hasSlots();
  }

  /**
   * 判断是否有子节点
   *
   * @returns true - 有子节点，false - 无子节点
   *
   * 判断条件：
   * - 必须是容器节点
   * - children 不为空（notEmptyNode）
   *
   * notEmptyNode 的作用：
   * - 过滤掉空的占位节点
   * - 只统计真实的子节点
   */
  hasChildren(): boolean {
    return !!(this.isContainer() && this.node.children?.notEmptyNode);
  }

  // ========== 公开方法：选中节点 ==========
  /**
   * 选中节点
   *
   * @param isMulti - 是否多选
   *
   * 功能：
   * - 单选：清空其他选中，只选中当前节点
   * - 多选：添加到选中列表
   *
   * 实现：
   * - 调用 SelectionManager 的方法
   * - selection.select(id): 单选
   * - selection.add(id): 多选
   *
   * 使用场景：
   * ```typescript
   * // 用户点击节点
   * treeNode.select(false);  // 单选
   *
   * // 用户 Ctrl+点击节点
   * treeNode.select(true);  // 多选
   * ```
   */
  select(isMulti: boolean) {
    const { node } = this;

    const selection = this.pluginContext.project.getCurrentDocument()?.selection;
    if (isMulti) {
      selection?.add(node.id);  // 多选：添加到选中列表
    } else {
      selection?.select(node.id);  // 单选：清空其他，只选中当前
    }
  }

  // ========== 公开方法：展开节点 ==========
  /**
   * 展开节点
   *
   * @param tryExpandParents - 是否同时展开所有父节点
   *
   * 功能：
   * - 展开当前节点
   * - 可选：展开所有祖先节点
   *
   * 实现细节：
   * - 必须检查 expandable（是否可展开）
   * - 必须检查 !this._expanded（避免重复）
   * - 不能直接使用 expanded getter（它包含根节点的特殊逻辑）
   *
   * 为什么要检查 expandable？
   * - 锁定的节点不能展开
   * - 叶子节点无法展开
   * - 避免无效操作
   *
   * 为什么要检查 !this._expanded？
   * - 避免重复发送事件
   * - 性能优化
   *
   * @example
   * ```typescript
   * // 展开节点
   * treeNode.expand();
   *
   * // 展开节点及其所有祖先
   * treeNode.expand(true);
   * ```
   */
  expand(tryExpandParents = false) {
    // 注意：这里不能直接使用 expanded getter
    // expanded 包含了根节点的特殊逻辑（根节点始终展开）
    // 需要额外判断 expandable 和 _expanded
    if (this.expandable && !this._expanded) {
      this.setExpanded(true);
    }

    // 可选：展开所有父节点
    if (tryExpandParents) {
      this.expandParents();
    }
  }

  // ========== 公开方法：展开所有父节点 ==========
  /**
   * 展开所有祖先节点
   *
   * 功能：
   * - 从父节点开始向上遍历
   * - 展开路径上的所有节点
   * - 直到根节点
   *
   * 使用场景：
   * ```typescript
   * // 用户在画布选中深层节点
   * // 自动在大纲树中定位并显示
   *
   * 初始状态：
   * Page
   * └─ Container (折叠)
   *
   * 调用 expandParents()：
   * Page
   * └─ Container (展开)
   *    └─ Header (展开)
   *       └─ Button (选中) <- 现在可以看到了
   * ```
   *
   * 实现：
   * - 使用 while 循环向上遍历
   * - 逐个展开父节点
   * - 直到没有父节点（到达根）
   */
  expandParents() {
    let p = this.node.parent;  // 从父节点开始
    while (p) {
      // 获取父节点的 TreeNode 并展开
      this.tree.getTreeNode(p).setExpanded(true);
      // 向上移动到爷爷节点
      p = p.parent;
    }
  }

  // ========== 公开方法：设置节点 ==========
  /**
   * 更新节点引用
   *
   * @param node - 新的设计器节点
   *
   * 功能：
   * - 替换内部的节点引用
   * - 用于节点更新时同步
   *
   * 使用场景：
   * - 设计器节点替换时
   * - 节点属性大量变化时
   *
   * 注意：
   * - 只在节点确实变化时更新
   * - 避免不必要的重新赋值
   */
  setNode(node: IPublicModelNode) {
    if (this._node !== node) {
      this._node = node;
    }
  }

  // ========== 计算属性：获取过滤结果 ==========
  /**
   * 获取过滤结果
   *
   * @returns FilterResult 对象
   *
   * 注意：属性名拼写错误（Result 拼成了 Reult）
   * - 保留错误拼写以保持向后兼容
   * - 不建议使用，应该直接访问 _filterResult
   */
  get filterReult(): FilterResult {
    return this._filterResult;
  }

  // ========== 公开方法：设置过滤结果 ==========
  /**
   * 设置过滤结果
   *
   * @param val - 新的过滤结果
   *
   * 功能：
   * - 更新过滤结果
   * - 发送 filterResultChanged 事件
   *
   * 调用时机：
   * - 用户输入过滤关键字
   * - 过滤算法重新计算
   *
   * 注意：属性名拼写错误（Result 拼成了 Reult）
   */
  setFilterReult(val: FilterResult) {
    this._filterResult = val;
    this.event.emit(EVENT_NAMES.filterResultChanged);
  }
}
