/**
 * ========================================
 * Div 组件工厂模块
 * ========================================
 *
 * 🎯 核心职责：
 * 创建一个纯 createElement 实现的 Div 组件（不使用 JSX）
 *
 * 💡 设计原因：
 * 1. 避免 JSX 依赖：renderer-core 包不应该依赖 JSX 转换
 * 2. 框架无关：通过 adapter.createElement 保持框架中立
 * 3. 兜底组件：作为默认容器和占位符
 *
 * 🔄 使用场景：
 * 1. ConfigProvider 不存在时的占位符
 * 2. 组件未找到时的降级容器
 * 3. Block/Page/Component 的默认容器
 * 4. 错误边界的包裹容器
 *
 * 📐 渲染结果：
 * <Div className="xxx" style={{...}}>
 *   {children}
 * </Div>
 *
 * 等价于：
 * <div className="xxx" style={{...}}>
 *   {children}
 * </div>
 */

import adapter from '../adapter';
import { IGeneralConstructor } from '../types';

/**
 * 🏭 Div 工厂函数
 *
 * 作用：创建 Div 组件类
 *
 * @returns Div 组件类
 */
export default function divFactory(): IGeneralConstructor {
  // 🔧 从适配器获取运行时 API
  const { PureComponent, createElement } = adapter.getRuntime();

  /**
   * 📦 Div 组件类
   *
   * 特点：
   * - 纯组件（PureComponent）：自动优化渲染性能
   * - 无 JSX：完全使用 createElement API
   * - 简单透传：直接将 props 传递给原生 div 元素
   */
  return class Div extends PureComponent {
    // 🏷️ 组件显示名称（用于 React DevTools）
    static displayName = 'Div';

    // 📌 版本号（当前未使用）
    static version = '0.0.0';

    /**
     * 🎨 渲染方法
     *
     * 逻辑：直接创建原生 div 元素，传递所有 props
     *
     * 等价于：<div {...this.props} />
     *
     * @returns React 元素
     */
    render() {
      // 🔥 使用 createElement 创建 div 元素
      // 参数1：'div' - 原生 HTML 标签名
      // 参数2：this.props - 所有属性（className、style、children 等）
      return createElement('div', this.props);
    }
  };
}
