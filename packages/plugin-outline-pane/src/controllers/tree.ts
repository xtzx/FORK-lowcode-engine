/**
 * @file Tree 树模型类
 * @description 表示单个文档的大纲树模型，管理树节点的映射和事件监听
 *
 * 核心职责：
 * 1. 管理文档的所有树节点（treeNodesMap）
 * 2. 监听文档的节点变化事件
 * 3. 提供树节点的查找和创建
 * 4. 提供树操作方法（展开、折叠）
 *
 * Tree vs TreeMaster：
 * ```
 * TreeMaster (全局，单例)
 * ├── Tree (文档1) <- 本类
 * │   └── TreeNode[] (节点映射)
 * ├── Tree (文档2)
 * │   └── TreeNode[]
 * └── Tree (文档3)
 *     └── TreeNode[]
 * ```
 *
 * 一对一关系：
 * - 一个文档（Document）对应一个树（Tree）
 * - 一个树节点（TreeNode）对应一个设计器节点（Node）
 * - 树负责管理文档内所有节点的映射
 *
 * 生命周期：
 * - 文档创建时创建树
 * - 文档切换时获取对应的树
 * - 文档删除时清理树
 *
 * @example
 * ```typescript
 * // 创建树（通常由 TreeMaster 自动创建）
 * const tree = new Tree(treeMaster);
 *
 * // 获取树节点
 * const treeNode = tree.getTreeNode(designerNode);
 *
 * // 展开所有祖先
 * tree.expandAllAncestors(treeNode);
 *
 * // 展开所有后代
 * tree.expandAllDecendants(treeNode);
 * ```
 */

import TreeNode from './tree-node';
import { IPublicModelNode, IPublicTypePropChangeOptions } from '@alilc/lowcode-types';
import { IOutlinePanelPluginContext, TreeMaster } from './tree-master';

// ==================== Tree 类 ====================
/**
 * 树模型类
 *
 * 职责：
 * - 管理单个文档的树节点映射
 * - 监听文档节点变化
 * - 提供树操作方法
 *
 * 核心数据结构：
 * - treeNodesMap: 节点ID -> TreeNode 的映射
 */
export class Tree {
  // ========== 私有属性：树节点映射 ==========
  /**
   * 树节点映射表
   *
   * 类型：Map<string, TreeNode>
   *
   * 结构：{ 节点ID: TreeNode实例 }
   *
   * 用途：
   * - 快速查找节点（O(1)）
   * - 缓存 TreeNode 实例
   * - 避免重复创建
   *
   * 为什么需要缓存？
   * - TreeNode 包含 UI 状态（expanded等）
   * - 重复创建会丢失状态
   * - 缓存保持状态连续性
   *
   * 示例：
   * ```typescript
   * treeNodesMap = {
   *   'node-page-1': TreeNode(Page),
   *   'node-container-1': TreeNode(Container),
   *   'node-button-1': TreeNode(Button)
   * }
   * ```
   */
  private treeNodesMap = new Map<string, TreeNode>();

  /**
   * 树的 ID（对应文档 ID）
   *
   * 用途：
   * - 标识树所属的文档
   * - 调试和日志
   */
  readonly id: string | undefined;

  /**
   * 插件上下文引用
   *
   * 用途：
   * - 访问编辑器 API
   * - 传递给 TreeNode
   */
  readonly pluginContext: IOutlinePanelPluginContext;

  // ========== 计算属性：根节点 ==========
  /**
   * 获取树的根节点
   *
   * @returns 根 TreeNode 或 null
   *
   * 实现：
   * - 从当前文档获取 focusNode
   * - 转换为 TreeNode
   *
   * focusNode 是什么？
   * - 当前关注的节点（通常是根节点）
   * - 用户可以设置不同的 focus
   * - 大纲树从 focusNode 开始显示
   *
   * 为什么不是 document.root？
   * - 支持显示部分子树
   * - 用户可能只想查看某个容器的内部结构
   * - 更灵活的视图控制
   */
  get root(): TreeNode | null {
    if (this.pluginContext.project.currentDocument?.focusNode) {
      return this.getTreeNode(this.pluginContext.project.currentDocument.focusNode!);
    }
    return null;
  }

  /**
   * TreeMaster 引用
   *
   * 用途：
   * - 访问全局控制器
   * - 获取其他文档的树
   */
  readonly treeMaster: TreeMaster;

  // ========== 构造函数 ==========
  /**
   * 构造 Tree 实例
   *
   * @param treeMaster - TreeMaster 引用
   *
   * 初始化流程：
   * 1. 保存 TreeMaster 和 pluginContext 引用
   * 2. 获取文档 ID
   * 3. 监听文档的节点变化事件
   *
   * 监听的事件：
   * - onChangeNodeChildren: 子节点变化
   * - onChangeCursor: 历史记录光标变化
   * - onChangeNodeProp: 节点属性变化
   * - onChangeNodeVisible: 节点显示/隐藏变化
   * - onImportSchema: 导入 Schema
   */
  constructor(treeMaster: TreeMaster) {
    // 保存引用
    this.treeMaster = treeMaster;
    this.pluginContext = treeMaster.pluginContext;

    // 获取当前文档
    const doc = this.pluginContext.project.currentDocument;
    this.id = doc?.id;

    // ===== 事件监听1：子节点变化 =====
    /**
     * 监听节点的子节点变化
     *
     * 触发时机：
     * - 添加子节点
     * - 删除子节点
     * - 子节点顺序变化
     *
     * 处理：
     * - 通知树节点可展开性可能变化
     * - 视图更新展开按钮状态
     *
     * 为什么要通知 expandableChanged？
     * - 无子节点 -> 有子节点：从不可展开变为可展开
     * - 有子节点 -> 无子节点：从可展开变为不可展开
     * - 需要更新 UI（显示/隐藏展开按钮）
     */
    doc?.onChangeNodeChildren((info: {node: IPublicModelNode }) => {
      const { node } = info;
      const treeNode = this.getTreeNodeById(node.id);
      treeNode?.notifyExpandableChanged();  // 通知可展开性变化
    });

    // ===== 事件监听2：历史记录光标变化 =====
    /**
     * 监听历史记录光标变化（撤销/重做）
     *
     * 触发时机：
     * - 用户撤销操作（Ctrl+Z）
     * - 用户重做操作（Ctrl+Shift+Z）
     *
     * 处理：
     * - 通知根节点可展开性可能变化
     *
     * 为什么要通知根节点？
     * - 撤销/重做可能改变整个树结构
     * - 根节点的可展开性代表整棵树的状态
     * - 触发全树更新
     */
    doc?.history.onChangeCursor(() => {
      this.root?.notifyExpandableChanged();
    });

    // ===== 事件监听3：节点属性变化 =====
    /**
     * 监听节点属性变化
     *
     * 触发时机：
     * - 用户修改节点属性
     * - 代码动态修改属性
     *
     * 处理：
     * - 如果是 title 属性：通知标题变化
     * - 如果是 condition 属性：通知条件渲染变化
     *
     * 特殊属性名：
     * - ___title___: 三个下划线，表示内部属性
     * - ___condition___: 条件渲染配置
     *
     * 为什么只监听这两个属性？
     * - 这两个属性影响大纲树的显示
     * - title: 节点标题
     * - condition: 是否显示条件图标
     * - 其他属性不影响大纲树
     */
    doc?.onChangeNodeProp((info: IPublicTypePropChangeOptions) => {
      const { node, key } = info;

      if (key === '___title___') {
        // 标题属性变化
        const treeNode = this.getTreeNodeById(node.id);
        treeNode?.notifyTitleLabelChanged();
      } else if (key === '___condition___') {
        // 条件属性变化
        const treeNode = this.getTreeNodeById(node.id);
        treeNode?.notifyConditionChanged();
      }
    });

    // ===== 事件监听4：节点显示/隐藏变化 =====
    /**
     * 监听节点显示/隐藏状态变化
     *
     * 触发时机：
     * - 用户点击"眼睛"图标
     * - 代码设置 node.visible
     *
     * 处理：
     * - 同步树节点的 hidden 状态
     *
     * 为什么要同步？
     * - 设计器节点的 visible 是数据源
     * - 树节点的 hidden 是视图状态
     * - 需要保持一致
     *
     * 注意：visible 和 hidden 是相反的
     * - visible=true  -> hidden=false
     * - visible=false -> hidden=true
     */
    doc?.onChangeNodeVisible((node: IPublicModelNode, visible: boolean) => {
      const treeNode = this.getTreeNodeById(node.id);
      treeNode?.setHidden(!visible);  // 注意：取反
    });

    // ===== 事件监听5：导入 Schema =====
    /**
     * 监听 Schema 导入事件
     *
     * 触发时机：
     * - 用户导入新的 Schema
     * - 从模板创建页面
     * - 复制粘贴大量节点
     *
     * 处理：
     * - 清空树节点映射表
     * - 重新创建所有树节点
     *
     * 为什么要清空？
     * - Schema 导入是替换操作
     * - 旧节点全部失效
     * - 需要重新建立映射
     * - 避免缓存脏数据
     */
    doc?.onImportSchema(() => {
      this.treeNodesMap = new Map<string, TreeNode>();
    });
  }

  // ========== 公开方法：设置节点选中 ==========
  /**
   * 设置节点选中状态并展开祖先
   *
   * @param nodeId - 节点 ID
   *
   * 功能：
   * - 查找树节点
   * - 展开所有祖先节点
   *
   * 使用场景：
   * - 用户在画布选中节点
   * - 大纲树自动定位到该节点
   * - 展开路径让节点可见
   *
   * 注释说明：
   * - "目标节点选中，其他节点展开"
   * - 实际是"目标节点的祖先展开"
   */
  setNodeSelected(nodeId: string): void {
    // 获取树节点
    const treeNode = this.treeNodesMap.get(nodeId);
    if (!treeNode) {
      return;  // 节点不存在
    }

    // 展开所有祖先节点
    this.expandAllAncestors(treeNode);
  }

  // ========== 公开方法：获取树节点 ==========
  /**
   * 根据设计器节点获取树节点
   *
   * @param node - 设计器节点
   * @returns TreeNode 实例
   *
   * 功能：
   * - 从缓存查找
   * - 如果存在，更新节点引用并返回
   * - 如果不存在，创建新的树节点
   *
   * 为什么要更新节点引用？
   * - 设计器节点可能被替换（撤销/重做）
   * - TreeNode 需要引用最新的节点
   * - tnode.setNode(node) 同步引用
   *
   * 懒加载机制：
   * - 只在需要时创建 TreeNode
   * - 不是一次性创建所有节点
   * - 节省内存和时间
   *
   * @example
   * ```typescript
   * const treeNode = tree.getTreeNode(designerNode);
   * treeNode.expand();
   * ```
   */
  getTreeNode(node: IPublicModelNode): TreeNode {
    // 从缓存查找
    if (this.treeNodesMap.has(node.id)) {
      const tnode = this.treeNodesMap.get(node.id)!;
      // 更新节点引用（可能节点对象已替换）
      tnode.setNode(node);
      return tnode;
    }

    // 不存在，创建新的树节点
    const treeNode = new TreeNode(this, node);
    this.treeNodesMap.set(node.id, treeNode);
    return treeNode;
  }

  // ========== 公开方法：通过ID获取树节点 ==========
  /**
   * 根据节点 ID 获取树节点
   *
   * @param id - 节点 ID
   * @returns TreeNode 实例或 undefined
   *
   * 功能：
   * - 直接从映射表获取
   * - 不会创建新节点
   *
   * 与 getTreeNode 的区别：
   * - getTreeNode: 不存在时创建
   * - getTreeNodeById: 不存在返回 undefined
   *
   * 使用场景：
   * - 检查节点是否已创建
   * - 更新已存在的节点状态
   */
  getTreeNodeById(id: string) {
    return this.treeNodesMap.get(id);
  }

  // ========== 公开方法：展开所有祖先 ==========
  /**
   * 展开节点的所有祖先节点
   *
   * @param treeNode - 目标树节点
   *
   * 功能：
   * - 向上遍历到根节点
   * - 收集所有祖先节点
   * - 逐个展开
   *
   * 算法：
   * 1. 从当前节点向上遍历
   * 2. 将祖先节点添加到数组开头（unshift）
   * 3. 遍历数组，逐个展开
   *
   * 为什么先收集再展开？
   * - 从上到下展开更自然
   * - 父节点先展开，子节点才可见
   * - 视觉效果更流畅
   *
   * 使用场景：
   * ```typescript
   * // 用户在画布选中深层节点
   * const treeNode = tree.getTreeNode(selectedNode);
   * tree.expandAllAncestors(treeNode);
   *
   * // 效果：
   * Page (展开)
   * └─ Container (展开)
   *    └─ Header (展开)
   *       └─ Button (选中) <- 现在可见
   * ```
   */
  expandAllAncestors(treeNode: TreeNode | undefined | null) {
    // 空值检查
    if (!treeNode) {
      return;
    }

    // 根节点无需展开
    if (treeNode.isRoot()) {
      return;
    }

    // 收集所有祖先节点
    const ancestors = [];
    let currentNode: TreeNode | null | undefined = treeNode;

    while (!treeNode.isRoot()) {
      currentNode = currentNode?.parent;
      if (currentNode) {
        // unshift: 添加到数组开头
        // 结果：ancestors = [根节点, 爷爷节点, 父节点]
        ancestors.unshift(currentNode);
      } else {
        break;  // 没有父节点了
      }
    }

    // 从上到下逐个展开
    ancestors.forEach((ancestor) => {
      ancestor.setExpanded(true);
    });
  }

  // ========== 公开方法：展开所有后代 ==========
  /**
   * 递归展开节点的所有后代节点
   *
   * @param treeNode - 起始树节点
   *
   * 功能：
   * - 展开节点自身
   * - 递归展开所有子节点
   * - 递归展开所有孙节点
   * - ...
   *
   * 算法：
   * - 深度优先遍历（DFS）
   * - 递归实现
   *
   * 使用场景：
   * ```typescript
   * // 用户右键菜单"展开所有"
   * tree.expandAllDecendants(containerNode);
   *
   * // 效果：
   * Container (展开)
   * ├─ Header (展开)
   * │  └─ Logo (展开)
   * ├─ Body (展开)
   * │  ├─ Content (展开)
   * │  └─ Sidebar (展开)
   * └─ Footer (展开)
   *
   * 所有后代全部展开
   * ```
   *
   * 注意：
   * - 节点很多时可能影响性能
   * - 建议添加深度限制
   */
  expandAllDecendants(treeNode: TreeNode | undefined | null) {
    // 空值检查
    if (!treeNode) {
      return;
    }

    // 展开当前节点
    treeNode.setExpanded(true);

    // 获取子节点
    const children = treeNode && treeNode.children;

    if (children) {
      // 递归展开每个子节点
      children.forEach((child) => {
        this.expandAllDecendants(child);  // 递归调用
      });
    }
  }

  // ========== 公开方法：折叠所有后代 ==========
  /**
   * 递归折叠节点的所有后代节点
   *
   * @param treeNode - 起始树节点
   *
   * 功能：
   * - 折叠节点自身
   * - 递归折叠所有子节点
   * - 递归折叠所有孙节点
   * - ...
   *
   * 算法：
   * - 深度优先遍历（DFS）
   * - 递归实现
   *
   * 使用场景：
   * ```typescript
   * // 用户右键菜单"折叠所有"
   * tree.collapseAllDecendants(containerNode);
   *
   * // 效果：
   * Container (折叠)
   *
   * 所有后代全部不可见
   * ```
   *
   * 与 expandAllDecendants 对称：
   * - expand: setExpanded(true)
   * - collapse: setExpanded(false)
   */
  collapseAllDecendants(treeNode: TreeNode | undefined | null): void {
    // 空值检查
    if (!treeNode) {
      return;
    }

    // 折叠当前节点
    treeNode.setExpanded(false);

    // 获取子节点
    const children = treeNode && treeNode.children;

    if (children) {
      // 递归折叠每个子节点
      children.forEach((child) => {
        this.collapseAllDecendants(child);  // 递归调用
      });
    }
  }
}
