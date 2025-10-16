/**
 * @file Slot 插槽容器组件
 * @description 提供插槽（Slot）功能的容器组件
 *
 * 作用：
 * - 定义可配置的内容插槽
 * - 支持插槽标题和参数配置
 * - 用于组件间内容传递
 * - 实现动态内容渲染
 *
 * 使用场景：
 * - 低代码组件的插槽定义
 * - 列表项模板（传入 item、index 等参数）
 * - 自定义渲染区域
 * - 组件内容扩展点
 *
 * 插槽概念：
 * - 类似 Vue 的 slot 或 React 的 render props
 * - 允许父组件向子组件传入内容
 * - 支持参数传递（如列表渲染时的 item）
 *
 * @example
 * ```jsx
 * // Schema 中的使用
 * {
 *   componentName: 'List',
 *   dataSource: [1, 2, 3],
 *   children: {
 *     componentName: 'Slot',
 *     props: {
 *       ___title: '列表项模板',
 *       ___params: ['item', 'index']
 *     },
 *     children: [
 *       {
 *         componentName: 'div',
 *         children: '${item}'
 *       }
 *     ]
 *   }
 * }
 * ```
 */

import { Component } from 'react';

/**
 * Slot 插槽容器组件类
 *
 * 设计理念：
 * - 提供插槽功能，支持内容传递
 * - 配置插槽标题，便于设计器识别
 * - 配置插槽参数，实现动态渲染
 * - 使用 Fragment 包裹，不添加额外 DOM
 */
class Slot extends Component {
  /**
   * 组件显示名称
   * 用于 React DevTools 和调试
   */
  static displayName = 'Slot';

  /**
   * 组件元数据
   *
   * 用于设计器识别和配置组件
   *
   * 配置说明：
   * - componentName: 组件名称
   * - configure: 设计器配置
   *   - props: 可配置的属性
   *   - component: 组件特性
   *   - supports: 功能支持
   */
  static componentMetadata = {
    componentName: 'Slot',
    configure: {
      // ========== 属性配置 ==========
      props: [
        // --- 插槽标题 ---
        {
          name: '___title',  // 三个下划线表示内部属性，不会传递给组件
          title: {
            type: 'i18n',  // 国际化标题
            'en-US': 'Slot Title',
            'zh-CN': '插槽标题',
          },
          setter: 'StringSetter',  // 使用字符串输入框
          defaultValue: '插槽容器',  // 默认标题
        },
        // --- 插槽参数 ---
        {
          name: '___params',  // 插槽参数列表
          title: {
            type: 'i18n',
            'en-US': 'Slot Params',
            'zh-CN': '插槽入参',
          },
          // 使用数组设置器，允许配置多个参数
          setter: {
            componentName: 'ArraySetter',  // 数组设置器
            props: {
              // 数组项使用字符串设置器
              itemSetter: {
                componentName: 'StringSetter',
                props: {
                  placeholder: {
                    type: 'i18n',
                    'zh-CN': '参数名称',
                    'en-US': 'Argument Name',
                  },
                },
              },
            },
          },
        },
      ],
      // ========== 组件特性 ==========
      component: {
        isContainer: true,  // 标记为容器组件，可以拖入子组件
      },
      // ========== 功能支持 ==========
      // 禁用所有额外功能
      // 插槽组件不需要事件、样式等配置
      supports: false,
    },
  };

  /**
   * 渲染方法
   *
   * 实现：使用 Fragment 包裹 children
   *
   * 为什么使用 Fragment？
   * - 不添加额外的 DOM 元素
   * - 保持 HTML 结构简洁
   * - 允许渲染多个子元素
   *
   * 与 Leaf 的区别：
   * ```jsx
   * // Leaf: 直接返回 children
   * render() {
   *   return children;
   * }
   *
   * // Slot: 使用 Fragment 包裹
   * render() {
   *   return <>{children}</>;
   * }
   * ```
   *
   * 为什么有这个区别？
   * - Leaf 用于叶子节点（通常是文本）
   * - Slot 用于容器（可能有多个子元素）
   * - Fragment 明确表示"这是一个容器"
   *
   * 注意：
   * - ___title 和 ___params 只在设计器中使用
   * - 实际渲染时不会用到这些属性
   * - 这些属性被设计器用于生成代码或配置
   */
  render() {
    const { children } = this.props;
    // 使用 Fragment（<>...</>）包裹 children
    // Fragment 不会在 DOM 中创建额外元素
    return <>{children}</>;
  }
}

export default Slot;
