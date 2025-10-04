/**
 * ========================================
 * @alilc/lowcode-renderer-core 核心包入口
 * ========================================
 *
 * 🎯 职责：
 * 这是渲染器的核心实现包，提供框架无关的渲染逻辑
 * 通过适配器模式支持 React、Rax 等不同框架
 *
 * 📦 导出内容：
 * - adapter: 框架适配器，抹平不同框架差异
 * - contextFactory: Context 工厂，创建应用上下文
 * - renderer: 各种渲染器（Page/Component/Block/Addon/Temp）
 * - types: TypeScript 类型定义
 * - utils: 工具函数集合
 * - hoc: 高阶组件（leafWrapper、compWrapper）
 *
 * 🔧 使用方式：
 * 1. React 版本：@alilc/lowcode-react-renderer 依赖本包
 * 2. Rax 版本：@alilc/lowcode-rax-renderer 依赖本包（已废弃）
 * 3. 其他框架：可基于本包实现新的渲染器
 */

// 🔧 适配器模块：框架无关的核心适配层
// 作用：提供统一的 API 接口，屏蔽不同框架的实现差异
// 例如：React.createElement vs Rax.createElement 都通过 adapter.getRuntime().createElement() 访问
import adapter from './adapter';

// 📦 Context 工厂模块：创建应用级 React Context
// 作用：提供跨组件的数据传递能力（appHelper、components、engine 等）
// 注意：Context 实例会缓存到 window.__appContext，避免重复创建
import contextFactory from './context';

// 📤 导出适配器和 Context 工厂（供外部直接使用）
export { adapter, contextFactory };

// 📤 导出所有渲染器工厂函数
// 包括：baseRendererFactory、pageRendererFactory、componentRendererFactory 等
export * from './renderer';

// 📤 导出类型定义（使用命名空间导出，避免类型污染）
// 包括：IRendererProps、IBaseRendererProps、IRenderComponent 等
export * as types from './types';

// 📤 导出工具函数（使用命名空间导出）
// 包括：parseExpression、parseData、isSchema、isEmpty 等
export * as utils from './utils';

// 📤 导出高阶组件（HOC）
// 包括：leafWrapper（响应式）、compWrapper（错误边界）
export * from './hoc';
