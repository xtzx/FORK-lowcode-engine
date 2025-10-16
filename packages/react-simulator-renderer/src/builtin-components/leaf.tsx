/**
 * @file Leaf 叶子节点组件
 * @description 最简单的容器组件，直接透传 children
 *
 * 作用：
 * - 包裹纯文本或不需要特殊处理的内容
 * - 在设计器中作为叶子节点（不可再嵌套）
 * - 禁用所有设计器功能（事件、样式、类名等）
 *
 * 使用场景：
 * - 包裹纯文本内容
 * - 简化 Schema 结构
 * - 避免不必要的 DOM 嵌套
 *
 * 特点：
 * - 不渲染任何额外 DOM 元素
 * - 设计器中禁用所有配置项
 * - 只支持 children 属性
 *
 * @example
 * ```jsx
 * // Schema 中的使用
 * {
 *   componentName: 'Leaf',
 *   children: 'Hello World'
 * }
 *
 * // 渲染结果：
 * Hello World  // 直接输出文本，无额外 DOM
 * ```
 */

import { Component } from 'react';

/**
 * Leaf 叶子节点组件类
 *
 * 设计理念：
 * - 最小化组件，零开销
 * - 直接透传 children，不添加任何包裹元素
 * - 在设计器中禁用所有配置功能
 */
class Leaf extends Component {
  /**
   * 组件显示名称
   * 用于 React DevTools 和调试
   */
  static displayName = 'Leaf';

  /**
   * 组件元数据
   *
   * 用于设计器识别和配置组件
   *
   * 配置说明：
   * - componentName: 组件名称（必须与 displayName 一致）
   * - configure: 设计器配置
   *   - props: 可配置的属性列表
   *     - name: 'children' - 子内容（通常是文本）
   *     - setter: 'StringSetter' - 使用字符串设置器
   *   - supports: false - 禁用所有额外功能
   *     - events: 不支持事件绑定
   *     - className: 不支持类名设置
   *     - style: 不支持样式设置
   *     - general: 不支持通用配置
   *     - directives: 不支持指令
   */
  static componentMetadata = {
    componentName: 'Leaf',
    configure: {
      // 属性配置
      props: [{
        name: 'children',  // 子内容属性
        setter: 'StringSetter',  // 使用字符串输入框
      }],
      // 禁用所有设计器功能
      // 这样设计器就不会显示事件、样式等配置面板
      supports: false,
    },
  };

  /**
   * 渲染方法
   *
   * 实现：直接返回 children，不做任何包裹
   *
   * 为什么这样设计？
   * - 避免不必要的 DOM 嵌套
   * - 减少渲染开销
   * - 保持 HTML 结构简洁
   *
   * 对比其他组件：
   * ```jsx
   * // Slot 组件：
   * render() {
   *   return <>{children}</>;  // 使用 Fragment 包裹
   * }
   *
   * // Leaf 组件：
   * render() {
   *   return children;  // 直接返回，零开销
   * }
   * ```
   */
  render() {
    const { children } = this.props;
    // 直接返回 children，不添加任何包裹
    // React 允许直接返回 string、number、ReactElement 等
    return children;
  }
}

export default Leaf;
