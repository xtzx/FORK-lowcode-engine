/**
 * ========================================
 * Temp 渲染器工厂模块
 * ========================================
 *
 * 🎯 核心职责：
 * 创建专门处理下钻编辑场景的临时渲染器
 *
 * 🔍 下钻编辑（Drill-down Editing）概念：
 * 在画布中双击某个低代码组件，进入该组件的内部进行编辑
 * 类似于 Sketch/Figma 中的"进入组件"功能
 *
 * 💡 使用场景示例：
 * 1. 主页面有一个自定义的 UserCard 组件
 * 2. 双击 UserCard，进入下钻编辑模式
 * 3. TempRenderer 渲染 UserCard 的内部结构
 * 4. 编辑完成后，退出下钻编辑，返回主页面
 *
 * 🔑 关键特性：
 * 1. 劫持父组件的 setState：实现跨层级状态同步
 * 2. 轻量级初始化：不执行完整的数据源加载
 * 3. 保持父组件上下文：通过 __ctx 访问父组件的 state
 */

import { IBaseRenderComponent } from '../types';
import logger from '../utils/logger';
import baseRendererFactory from './base';

/**
 * 🏭 Temp 渲染器工厂函数
 *
 * @returns TempRenderer 类（继承自 BaseRenderer）
 */
export default function tempRendererFactory(): IBaseRenderComponent {
  // 🏗️ 获取基础渲染器类
  const BaseRenderer = baseRendererFactory();

  /**
   * ⏱️ TempRenderer 类
   * 临时渲染器，用于下钻编辑场景
   */
  return class TempRenderer extends BaseRenderer {
    // 🏷️ 组件显示名称
    static displayName = 'TempRenderer';

    // 🔖 命名空间标识：用于生成 CSS 类名（lce-temp）
    __namespace = 'temp';

    // 💾 缓存原始的 setState 方法
    // 用途：在组件卸载时恢复父组件的 setState
    cacheSetState?: Record<string, any>;

    /**
     * 🔧 初始化方法
     *
     * 作用：创建空状态，不执行复杂的初始化逻辑
     *
     * 特点：比 Page/Component 更轻量，快速启动
     */
    __init() {
      this.state = {};           // 空状态
      this.cacheSetState = {};   // 空缓存
    }

    /**
     * 📡 组件挂载钩子
     *
     * 核心作用：劫持父组件的 setState 方法
     *
     * 原理：
     * 1. 保存父组件原始的 setState
     * 2. 替换为新的 setState，同时调用原始方法和 forceUpdate
     * 3. 实现父子组件状态同步
     *
     * 场景：
     * - 在下钻编辑中修改低代码组件的内部状态
     * - 需要同时更新父组件和临时渲染器
     */
    async componentDidMount() {
      const ctx = this.props.__ctx;  // 获取父组件上下文
      if (!ctx) return;

      const { setState } = ctx;

      // 💾 缓存原始的 setState 方法
      this.cacheSetState = setState;

      // 🔄 劫持 setState：调用原始方法 + 触发临时渲染器更新
      ctx.setState = (...args: any) => {
        setState.call(ctx, ...args);           // 调用父组件的原始 setState
        setTimeout(() => this.forceUpdate(), 0); // 延迟触发临时渲染器的更新
      };

      this.__debug(`componentDidMount - ${this.props.__schema.fileName}`);
    }

    /**
     * 🔄 组件更新钩子
     */
    async componentDidUpdate() {
      this.__debug(`componentDidUpdate - ${this.props.__schema.fileName}`);
    }

    /**
     * 🗑️ 组件卸载钩子
     *
     * 作用：恢复父组件的原始 setState 方法
     *
     * 重要性：避免内存泄漏和状态管理混乱
     */
    async componentWillUnmount() {
      const ctx = this.props.__ctx;
      if (!ctx || !this.cacheSetState) return;

      // 🔄 恢复原始的 setState 方法
      ctx.setState = this.cacheSetState;

      // 🧹 清理缓存
      delete this.cacheSetState;

      this.__debug(`componentWillUnmount - ${this.props.__schema.fileName}`);
    }

    /**
     * 🚨 错误捕获钩子
     */
    async componentDidCatch(e: any) {
      logger.warn(e);
      this.__debug(`componentDidCatch - ${this.props.__schema.fileName}`);
    }

    /**
     * 🎨 渲染方法
     *
     * 特点：简化渲染，直接渲染内容
     */
    render() {
      const { __schema, __ctx } = this.props;

      // ✅ Schema 结构验证
      if (this.__checkSchema(__schema)) {
        return '下钻编辑 schema 结构异常！';
      }

      this.__debug(`${TempRenderer.displayName} render - ${__schema?.fileName}`);

      // 🏠 渲染内容：使用默认 div 容器
      // 传递父组件上下文 __ctx
      return this.__renderContent(this.__renderContextProvider({ __ctx }));
    }
  };
}
