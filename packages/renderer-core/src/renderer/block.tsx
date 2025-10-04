/**
 * ========================================
 * Block 渲染器工厂模块
 * ========================================
 *
 * 🎯 核心职责：
 * 创建专门处理 componentName === 'Block' 的渲染器类
 *
 * 📦 Block Schema 结构示例：
 * {
 *   componentName: 'Block',
 *   fileName: 'HeaderBlock',
 *   state: {                    // 区块级状态（可选）
 *     collapsed: false
 *   },
 *   dataSource: {               // 区块级数据源（可选）
 *     list: [...]
 *   },
 *   children: [...]             // 区块子组件
 * }
 *
 * 🔑 关键特性：
 * 1. 轻量级容器：不提供特殊上下文（无 this.page、this.component）
 * 2. 支持 state 和 dataSource（可选）
 * 3. 通常用于页面的某个区域或模块
 * 4. 可以被复用到不同页面
 *
 * 🆚 与其他渲染器的区别：
 * - PageRenderer: 页面级，提供 this.page
 * - ComponentRenderer: 组件级，提供 this.component
 * - BlockRenderer: 区块级，无特殊上下文，最轻量
 *
 * 💡 使用场景：
 * - 页面的某个独立区域（如侧边栏、工具栏）
 * - 可复用的内容块（如商品卡片、用户信息块）
 * - 不需要独立状态管理的简单容器
 */

import baseRendererFactory from './base';
import { IBaseRendererProps, IBaseRenderComponent } from '../types';

/**
 * 🏭 Block 渲染器工厂函数
 *
 * @returns BlockRenderer 类（继承自 BaseRenderer）
 */
export default function blockRendererFactory(): IBaseRenderComponent {
  // 🏗️ 获取基础渲染器类
  const BaseRenderer = baseRendererFactory();

  /**
   * 📦 BlockRenderer 类
   * 轻量级的区块渲染器
   */
  return class BlockRenderer extends BaseRenderer {
    // 🏷️ 组件显示名称
    static displayName = 'BlockRenderer';

    // 🔖 命名空间标识：用于生成 CSS 类名（lce-block）
    __namespace = 'block';

    /**
     * 🔧 初始化后处理钩子
     *
     * 作用：
     * 1. 生成空上下文（Block 不提供特殊上下文对象）
     * 2. 初始化状态（如果 schema.state 存在）
     * 3. 初始化数据源（如果 schema.dataSource 存在）
     * 4. 执行构造函数生命周期
     *
     * @param props - 渲染器属性
     */
    __afterInit(props: IBaseRendererProps) {
      // 🌍 生成空上下文
      // 注意：不像 Page/Component 那样注入 this.page/this.component
      // 子组件只能访问父级的 page 或 component 上下文
      this.__generateCtx({});

      const schema = props.__schema || {};

      // 📊 初始化状态（如果有）
      this.state = this.__parseData(schema.state || {});

      // 📡 初始化数据源（如果有）
      this.__initDataSource(props);

      // 🎯 执行构造函数生命周期
      this.__executeLifeCycleMethod('constructor', [...arguments]);
    }

    /**
     * 🎨 渲染方法
     *
     * 核心流程：
     * 1. 验证 Schema 结构（允许 'Block' 或 'Div'）
     * 2. 执行渲染前处理
     * 3. 根据配置选择渲染方式
     */
    render() {
      const { __schema, __components } = this.props;

      // ✅ Schema 结构验证
      // 允许的 componentName: 'Block' 或 'Div'
      // 原因：Div 也复用了 BlockRenderer
      if (this.__checkSchema(__schema, 'Div')) {
        return '区块 schema 结构异常！';
      }

      // 📋 调试日志
      this.__debug(`${BlockRenderer.displayName} render - ${__schema?.fileName}`);

      // 🌍 生成上下文（空对象）
      this.__generateCtx({});

      // 🎨 执行渲染前处理
      this.__render();

      // 🎯 渲染方式1：用户提供了自定义 Block 组件
      const { Block } = __components;
      if (Block) {
        // 使用自定义 Block 组件包裹内容
        // 例如：<Block>{...children}</Block>
        return this.__renderComp(Block, {});
      }

      // 🎯 渲染方式2：默认渲染（使用 div 容器）
      // 渲染为：<div className="lce-block">{...children}</div>
      // 注意：不注入特殊的 context，保持简洁
      return this.__renderContent(this.__renderContextProvider());
    }
  };
}
