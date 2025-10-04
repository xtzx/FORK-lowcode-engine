/**
 * ========================================
 * 渲染器模块导出文件
 * ========================================
 *
 * 🎯 职责：
 * 统一导出所有渲染器工厂函数
 *
 * 📦 渲染器层级关系：
 *
 * rendererFactory (入口渲染器)
 *     ↓ 根据 schema.componentName 路由到：
 * ┌────────────────────────────────────────┐
 * │ pageRendererFactory (页面渲染器)        │
 * │ componentRendererFactory (组件渲染器)   │
 * │ blockRendererFactory (区块渲染器)       │
 * │ addonRendererFactory (插件渲染器)       │
 * │ tempRendererFactory (临时渲染器)        │
 * └────────────────┬───────────────────────┘
 *                  ↓ 都继承自：
 *          baseRendererFactory (基础渲染器)
 *
 * 🔄 工厂模式的优势：
 * - 延迟创建：只有在需要时才创建渲染器类
 * - 依赖注入：可以在创建时注入不同的依赖
 * - 框架无关：通过适配器模式支持不同框架
 */

// 🏗️ 基础渲染器工厂：所有渲染器的父类
// 包含核心的 Schema → React 转换逻辑
// 提供：__createVirtualDom、__parseProps、__createLoopVirtualDom 等核心方法
import baseRendererFactory from './base';

// 📄 页面渲染器工厂：专门处理 componentName === 'Page' 的 Schema
// 特性：管理页面级 state、数据源、提供 this.page 上下文
import pageRendererFactory from './page';

// 🧩 组件渲染器工厂：专门处理 componentName === 'Component' 的 Schema
// 特性：管理组件级 state、数据源、提供 this.component 上下文
import componentRendererFactory from './component';

// 📦 区块渲染器工厂：专门处理 componentName === 'Block' 的 Schema
// 特性：轻量级容器，不提供页面级功能
import blockRendererFactory from './block';

// 🔌 插件渲染器工厂：专门处理 componentName === 'Addon' 的 Schema
// 特性：注册到 appHelper.addons，可通过 key 访问插件实例
import addonRendererFactory from './addon';

// ⏱️ 临时渲染器工厂：专门处理下钻编辑场景
// 特性：劫持父组件的 setState，实现跨层级状态同步
import tempRendererFactory from './temp';

// 🚪 入口渲染器工厂：最外层的路由渲染器
// 特性：
//   - 根据 schema.componentName 选择对应的渲染器
//   - 包装 AppContext.Provider 和 ConfigProvider
//   - 提供错误边界和组件未找到处理
import rendererFactory from './renderer';

// 📤 统一导出所有渲染器工厂
export {
  baseRendererFactory,        // 基础渲染器（核心转换引擎）
  pageRendererFactory,        // 页面渲染器
  componentRendererFactory,   // 组件渲染器
  blockRendererFactory,       // 区块渲染器
  addonRendererFactory,       // 插件渲染器
  tempRendererFactory,        // 临时渲染器
  rendererFactory,            // 入口渲染器（路由分发）
};
