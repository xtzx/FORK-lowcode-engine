/**
 * @file filter-tree 过滤树逻辑
 * @description 实现大纲树的过滤算法，支持关键字和条件组合过滤
 *
 * 核心功能：
 * 1. 定义过滤类型常量
 * 2. 定义过滤选项列表
 * 3. 实现递归过滤算法
 *
 * 过滤策略：
 * - 关键字匹配：节点名称包含关键字
 * - 条件筛选：节点满足指定条件
 * - AND 关系：关键字 AND 条件（同时满足）
 * - OR 关系（子树）：节点自身命中 OR 子节点命中
 *
 * 算法特点：
 * - 递归遍历：深度优先
 * - 标记模式：不删除节点，只标记匹配结果
 * - 自动展开：子节点命中时自动展开父节点
 *
 * 性能考虑：
 * - 每次过滤都遍历整棵树（O(n)）
 * - 大树可能有性能问题
 * - 可以考虑防抖优化
 */

import TreeNode from '../controllers/tree-node';

// ==================== 过滤类型常量 ====================
/**
 * 过滤类型枚举
 *
 * 用途：
 * - 定义筛选条件的类型
 * - 用于 switch case 判断
 * - 避免魔术字符串
 *
 * 类型说明：
 * - CONDITION: 条件渲染节点（有v-if类似的条件）
 * - LOOP: 循环渲染节点（有v-for类似的循环）
 * - LOCKED: 锁定节点（不可编辑）
 * - HIDDEN: 隐藏节点（不可见）
 */
export const FilterType = {
  CONDITION: 'CONDITION',  // 条件渲染
  LOOP: 'LOOP',  // 循环渲染
  LOCKED: 'LOCKED',  // 锁定
  HIDDEN: 'HIDDEN',  // 隐藏
};

// ==================== 过滤选项列表 ====================
/**
 * 过滤选项配置数组
 *
 * 用途：
 * - 渲染筛选条件的复选框
 * - 提供过滤选项的元数据
 *
 * 字段说明：
 * - value: 选项值（对应 FilterType）
 * - label: 显示标签（国际化key）
 *
 * 使用场景：
 * ```tsx
 * {FILTER_OPTIONS.map(op => (
 *   <Checkbox value={op.value}>
 *     {intl(op.label)}
 *   </Checkbox>
 * ))}
 * ```
 *
 * 用户视图：
 * ```
 * 过滤选项：
 * ☐ 条件渲染
 * ☐ 循环渲染
 * ☐ 锁定
 * ☐ 隐藏
 * ```
 */
export const FILTER_OPTIONS = [{
  value: FilterType.CONDITION,  // 'CONDITION'
  label: 'Conditional rendering',  // '条件渲染'
}, {
  value: FilterType.LOOP,  // 'LOOP'
  label: 'Loop rendering',  // '循环渲染'
}, {
  value: FilterType.LOCKED,  // 'LOCKED'
  label: 'Locked',  // '锁定'
}, {
  value: FilterType.HIDDEN,  // 'HIDDEN'
  label: 'Hidden',  // '隐藏'
}];

// ==================== 核心过滤函数 ====================
/**
 * 递归匹配树节点
 *
 * @param treeNode - 要匹配的树节点
 * @param keywords - 搜索关键字
 * @param filterOps - 筛选条件数组
 * @returns true - 节点匹配，false - 节点不匹配
 *
 * 算法流程：
 * 1. 检查节点有效性
 * 2. 如果无过滤条件，重置所有节点
 * 3. 判断节点是否匹配筛选条件
 * 4. 判断节点是否匹配关键字
 * 5. 计算节点自身匹配结果（AND关系）
 * 6. 递归检查子节点
 * 7. 计算子树匹配结果（OR关系）
 * 8. 如果子节点匹配，自动展开当前节点
 * 9. 设置节点的过滤结果
 * 10. 返回匹配结果（自身 OR 子节点）
 *
 * 匹配规则：
 * ```
 * matchSelf = matchFilterOps AND matchKeywords
 * matchChild = 子节点1 OR 子节点2 OR ...
 * 最终匹配 = matchSelf OR matchChild
 * ```
 *
 * 特殊规则：
 * - 根节点永远匹配（保证树有根）
 * - 子节点匹配时自动展开父节点（方便查看）
 *
 * 递归终止条件：
 * - 节点无效
 * - 叶子节点（无子节点）
 *
 * 性能特点：
 * - 时间复杂度：O(n)，n 为节点总数
 * - 空间复杂度：O(h)，h 为树的高度（递归栈）
 *
 * @example
 * ```typescript
 * // 示例1：只搜索关键字
 * matchTreeNode(root, 'Button', []);
 * // 匹配所有名称包含 'Button' 的节点
 *
 * // 示例2：只筛选条件
 * matchTreeNode(root, '', ['HIDDEN', 'LOCKED']);
 * // 匹配所有隐藏或锁定的节点
 *
 * // 示例3：组合过滤
 * matchTreeNode(root, 'Button', ['HIDDEN']);
 * // 匹配名称包含 'Button' 且 隐藏的节点
 *
 * // 过滤效果：
 * Page (显示，matchChild=true)
 * └─ Container (显示，matchChild=true)
 *    ├─ Button (显示，matchSelf=true) <- 匹配
 *    └─ Input (隐藏，无匹配)
 * ```
 */
export const matchTreeNode = (
  treeNode: TreeNode,
  keywords: string,
  filterOps: string[],
): boolean => {
  // ===== 第1步：无效节点检查 =====
  // 节点不存在或节点数据不存在
  if (!treeNode || !treeNode.node) {
    return false;
  }

  // ===== 第2步：无过滤条件处理 =====
  // 关键字为空 且 筛选条件为空 -> 重置过滤
  if (!keywords && filterOps.length === 0) {
    // 重置当前节点的过滤结果
    treeNode.setFilterReult({
      filterWorking: false,  // 过滤未启用
      matchChild: false,  // 无子节点匹配
      matchSelf: false,  // 自身不匹配
      keywords: '',  // 无关键字
    });

    // 递归重置所有子节点和插槽节点
    (treeNode.children || []).concat(treeNode.slots || []).forEach((childNode) => {
      matchTreeNode(childNode, keywords, filterOps);
    });

    return false;  // 无过滤条件，返回不匹配
  }

  // ===== 第3步：获取设计器节点 =====
  const { node } = treeNode;

  // ===== 第4步：判断是否匹配筛选条件 =====
  /**
   * 筛选条件匹配逻辑
   *
   * 规则：
   * - filterOps 为空：匹配（不筛选）
   * - filterOps 不为空：至少匹配一个条件（OR关系）
   *
   * 条件判断：
   * - CONDITION: node.hasCondition() - 有条件配置
   * - LOOP: node.hasLoop() - 有循环配置
   * - LOCKED: treeNode.locked - 节点锁定
   * - HIDDEN: treeNode.hidden - 节点隐藏
   *
   * !! 的作用：
   * - 将 truthy/falsy 转换为 boolean
   * - find() 返回元素或 undefined
   * - !!undefined = false
   * - !!element = true
   */
  const matchFilterOps = filterOps.length === 0 || !!filterOps.find((op: string) => {
    switch (op) {
      case FilterType.CONDITION:
        return node.hasCondition();  // 有条件渲染
      case FilterType.LOOP:
        return node.hasLoop();  // 有循环渲染
      case FilterType.LOCKED:
        return treeNode.locked;  // 锁定状态
      case FilterType.HIDDEN:
        return treeNode.hidden;  // 隐藏状态
      default:
        return false;
    }
  });

  // ===== 第5步：判断是否匹配关键字 =====
  /**
   * 关键字匹配逻辑
   *
   * 规则：
   * - titleLabel 必须是字符串
   * - 包含关键字（indexOf > -1）
   *
   * 大小写敏感：
   * - 当前实现：大小写敏感
   * - 改进：toLowerCase() 实现不敏感
   *
   * indexOf 的作用：
   * - 查找子字符串位置
   * - 返回 -1 表示未找到
   * - 返回 >= 0 表示找到
   */
  const matchKeywords = typeof treeNode.titleLabel === 'string' && treeNode.titleLabel.indexOf(keywords) > -1;

  // ===== 第6步：计算节点自身匹配 =====
  /**
   * 节点自身匹配逻辑
   *
   * 规则：
   * - 根节点：永远匹配（保证树有根）
   * - 其他节点：matchFilterOps AND matchKeywords
   *
   * AND 关系：
   * - 必须同时满足筛选条件和关键字
   * - 只满足一个不行
   *
   * 为什么根节点永远匹配？
   * - 否则整棵树都会消失
   * - 需要根节点作为树的锚点
   */
  const matchSelf = treeNode.isRoot() || (matchFilterOps && matchKeywords);

  // ===== 第7步：递归检查子节点 =====
  /**
   * 子树匹配逻辑
   *
   * 流程：
   * 1. 合并 children 和 slots
   * 2. 递归调用 matchTreeNode
   * 3. 收集每个子节点的匹配结果
   * 4. 使用 find(Boolean) 判断是否有匹配
   *
   * find(Boolean) 的技巧：
   * - Boolean 是构造函数，也是类型转换函数
   * - [false, false, true].find(Boolean) -> true
   * - 找到第一个 truthy 值
   *
   * !! 的作用：
   * - find() 可能返回 undefined
   * - !!undefined = false
   * - !!true = true
   */
  const matchChild = !!(treeNode.children || []).concat(treeNode.slots || [])
    .map((childNode: TreeNode) => {
      return matchTreeNode(childNode, keywords, filterOps);  // 递归
    }).find(Boolean);  // 是否有匹配的子节点

  // ===== 第8步：自动展开 =====
  /**
   * 子节点匹配时自动展开父节点
   *
   * 为什么要展开？
   * - 让用户看到匹配的子节点
   * - 否则子节点被折叠隐藏了
   *
   * 条件：
   * - matchChild: 有子节点匹配
   * - expandable: 节点可以展开
   */
  if (matchChild && treeNode.expandable) {
    treeNode.setExpanded(true);
  }

  // ===== 第9步：设置过滤结果 =====
  /**
   * 保存节点的过滤结果
   *
   * 结果包含：
   * - filterWorking: true（过滤启用）
   * - matchChild: 子树匹配结果
   * - matchSelf: 自身匹配结果
   * - keywords: 当前关键字（用于高亮）
   *
   * 视图如何使用：
   * ```tsx
   * if (!filterResult.filterWorking) {
   *   return <显示节点 />;
   * }
   * if (filterResult.matchSelf || filterResult.matchChild) {
   *   return <显示节点，高亮匹配部分 />;
   * }
   * return null;  // 不显示
   * ```
   */
  treeNode.setFilterReult({
    filterWorking: true,  // 过滤启用
    matchChild,  // 子树匹配
    matchSelf,  // 自身匹配
    keywords,  // 关键字
  });

  // ===== 第10步：返回匹配结果 =====
  /**
   * 返回节点是否匹配
   *
   * 规则：自身匹配 OR 子树匹配
   *
   * 用途：
   * - 告诉父节点：我这个分支是否有匹配
   * - 父节点根据此判断是否展开
   */
  return matchSelf || matchChild;
};
