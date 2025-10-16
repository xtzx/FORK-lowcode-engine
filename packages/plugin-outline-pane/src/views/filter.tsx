/**
 * @file Filter 过滤器组件
 * @description 大纲树的过滤器，支持关键字搜索和条件筛选
 *
 * 核心功能：
 * 1. 关键字搜索：输入文本过滤节点
 * 2. 条件筛选：根据节点特性过滤（隐藏、锁定、条件渲染等）
 * 3. 全选/反选：快速切换所有筛选条件
 * 4. 实时过滤：输入即时生效
 *
 * 过滤逻辑：
 * - 关键字：匹配节点名称（大小写不敏感）
 * - 筛选条件：AND 关系（同时满足所有选中的条件）
 * - 命中规则：节点自身或子节点命中
 *
 * UI 组件：
 * - Search: 搜索输入框（Fusion）
 * - Balloon: 气泡弹出框（悬停显示）
 * - Checkbox: 复选框组
 *
 * 筛选选项（FILTER_OPTIONS）：
 * - 显示隐藏的节点
 * - 显示锁定的节点
 * - 显示条件渲染的节点
 * - 显示循环渲染的节点
 *
 * @example
 * ```tsx
 * <Filter tree={tree} />
 *
 * // 用户输入"Button"
 * // -> 只显示名称包含"Button"的节点
 *
 * // 用户选中"显示隐藏的节点"
 * // -> 显示所有隐藏节点
 * ```
 */

import React, { PureComponent } from 'react';
import './style.less';  // 样式文件
import { IconFilter } from '../icons/filter';  // 过滤图标
import { Search, Checkbox, Balloon, Divider } from '@alifd/next';  // Fusion 组件
import TreeNode from '../controllers/tree-node';  // 树节点模型
import { Tree } from '../controllers/tree';  // 树模型
import { matchTreeNode, FILTER_OPTIONS } from './filter-tree';  // 过滤逻辑

// ==================== Filter 组件 ====================
/**
 * 过滤器组件类
 *
 * Props:
 * - tree: 树模型实例
 *
 * State:
 * - keywords: 搜索关键字
 * - filterOps: 选中的筛选条件数组
 *
 * 使用 PureComponent 的原因：
 * - 过滤器状态变化频繁
 * - 需要性能优化
 * - 避免不必要的重新渲染
 */
export default class Filter extends PureComponent<{
  tree: Tree;  // 树模型
}, {
  keywords: string;  // 搜索关键字
  filterOps: string[];  // 筛选条件数组
}> {
  // ========== 初始状态 ==========
  /**
   * 组件初始状态
   *
   * keywords: 空字符串（无搜索）
   * filterOps: 空数组（无筛选条件）
   *
   * 默认行为：
   * - 显示所有节点
   * - 不应用任何过滤
   */
  state = {
    keywords: '',  // 搜索关键字
    filterOps: [],  // 筛选条件（如['hidden', 'locked']）
  };

  // ========== 事件处理：搜索变化 ==========
  /**
   * 处理搜索框输入变化
   *
   * @param val - 输入的文本
   *
   * 功能：
   * - 去除首尾空格（trim）
   * - 更新 state
   * - 回调触发过滤（setState 的第二个参数）
   *
   * 为什么要 trim？
   * - 用户可能不小心输入空格
   * - 空格不应该影响匹配
   * - 提升用户体验
   *
   * setState 的第二个参数：
   * - 回调函数，在 state 更新后执行
   * - 确保使用最新的 state
   * - 避免异步问题
   */
  handleSearchChange = (val: string) => {
    this.setState({
      keywords: val.trim(),  // 去除空格
    }, this.filterTree);  // 回调：执行过滤
  };

  // ========== 事件处理：筛选条件变化 ==========
  /**
   * 处理筛选条件变化
   *
   * @param val - 选中的条件数组
   *
   * 功能：
   * - 更新选中的筛选条件
   * - 触发过滤
   *
   * 示例：
   * ```typescript
   * val = ['hidden', 'locked']
   * // 表示：显示隐藏的节点 + 显示锁定的节点
   * ```
   */
  handleOptionChange = (val: string[]) => {
    this.setState({
      filterOps: val,
    }, this.filterTree);  // 回调：执行过滤
  };

  // ========== 事件处理：全选/反选 ==========
  /**
   * 处理全选按钮点击
   *
   * 功能：
   * - 如果已全选：清空所有条件
   * - 如果未全选：选中所有条件
   *
   * 判断逻辑：
   * - filterOps.length === FILTER_OPTIONS.length：已全选
   * - 否则：未全选
   *
   * 切换行为：
   * - 全选 -> 反选（清空）
   * - 反选 -> 全选（所有条件）
   */
  handleCheckAll = () => {
    const { filterOps } = this.state;

    // 判断是否已全选
    const final = filterOps.length === FILTER_OPTIONS.length
      ? []  // 已全选，清空
      : FILTER_OPTIONS.map((op) => op.value);  // 未全选，全选

    // 更新筛选条件
    this.handleOptionChange(final);
  };

  // ========== 过滤方法 ==========
  /**
   * 执行树过滤
   *
   * 功能：
   * - 获取当前的关键字和筛选条件
   * - 调用 matchTreeNode 执行过滤
   * - matchTreeNode 会递归遍历树
   * - 设置每个节点的 filterResult
   *
   * 过滤结果影响：
   * - 节点的显示/隐藏
   * - 匹配的节点高亮显示
   * - 父节点自动展开（如果子节点匹配）
   *
   * 为什么不返回过滤后的节点列表？
   * - 采用"标记"而不是"过滤"
   * - 每个节点有 filterResult 属性
   * - 视图根据 filterResult 决定是否显示
   * - 保持树结构完整
   */
  filterTree() {
    const { tree } = this.props;
    const { keywords, filterOps } = this.state;

    // 从根节点开始递归过滤
    matchTreeNode(tree.root as TreeNode, keywords, filterOps);
  }

  // ========== 渲染方法 ==========
  /**
   * 渲染过滤器 UI
   *
   * 组件结构：
   * ```
   * <div className="lc-outline-filter">
   *   <Search />  // 搜索框
   *   <Balloon>   // 气泡弹窗
   *     <IconFilter />  // 触发器图标
   *     // 弹窗内容：
   *     <Checkbox />  // 全选
   *     <Divider />   // 分割线
   *     <Checkbox.Group>  // 筛选条件组
   *       <Checkbox />  // 各个条件
   *     </Checkbox.Group>
   *   </Balloon>
   * </div>
   * ```
   */
  render() {
    const { keywords, filterOps } = this.state;

    // ===== 计算全选状态 =====
    // indeterminate: 半选状态（部分选中）
    // checkAll: 全选状态（全部选中）
    const indeterminate = filterOps.length > 0 && filterOps.length < FILTER_OPTIONS.length;
    const checkAll = filterOps.length === FILTER_OPTIONS.length;

    return (
      <div className="lc-outline-filter">
        {/* ===== 搜索框 ===== */}
        <Search
          hasClear  // 显示清空按钮
          shape="simple"  // 简单样式
          placeholder={this.props.tree.pluginContext.intl('Filter Node')}  // 占位符："过滤节点"
          className="lc-outline-filter-search-input"  // 样式类名
          value={keywords}  // 受控组件
          onChange={this.handleSearchChange}  // 输入变化回调
        />

        {/* ===== 筛选条件气泡 ===== */}
        <Balloon
          v2  // 使用 v2 版本
          align="br"  // 对齐方式：bottom-right（右下对齐）
          closable={false}  // 不显示关闭按钮
          triggerType="hover"  // 触发方式：悬停
          trigger={(
            // 触发器：过滤图标
            <div className="lc-outline-filter-icon">
              <IconFilter />
            </div>
          )}
        >
          {/* ===== 全选复选框 ===== */}
          <Checkbox
            checked={checkAll}  // 全选状态
            indeterminate={indeterminate}  // 半选状态
            onChange={this.handleCheckAll}  // 点击全选
          >
            {this.props.tree.pluginContext.intlNode('Check All')}  {/* "全选" */}
          </Checkbox>

          {/* ===== 分割线 ===== */}
          <Divider />

          {/* ===== 筛选条件组 ===== */}
          <Checkbox.Group
            value={filterOps}  // 当前选中的条件
            direction="ver"  // 垂直方向
            onChange={this.handleOptionChange}  // 条件变化回调
          >
            {/* 遍历所有筛选选项 */}
            {FILTER_OPTIONS.map((op) => (
              <Checkbox
                id={op.value}  // 条件ID
                value={op.value}  // 条件值
                key={op.value}  // React key
              >
                {this.props.tree.pluginContext.intlNode(op.label)}  {/* 国际化标签 */}
              </Checkbox>
            ))}
          </Checkbox.Group>
        </Balloon>
      </div>
    );
  }
}
