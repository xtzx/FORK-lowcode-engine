/**
 * ========================================
 * 应用上下文工厂模块
 * ========================================
 *
 * 🎯 核心职责：
 * 创建并管理应用级的 React Context
 * 用于在组件树中传递全局数据（appHelper、components、engine 等）
 *
 * 📦 Context 中的数据结构：
 * {
 *   appHelper: {           // 应用辅助工具
 *     utils: {},           // 全局工具函数
 *     constants: {},       // 全局常量
 *     history: {},         // 路由历史
 *     location: {},        // 路由位置
 *   },
 *   components: {},        // 所有可用组件的映射表
 *   engine: Renderer,      // 渲染器引擎实例
 *   pageContext: Page,     // 页面上下文（PageRenderer 实例）
 *   compContext: Component,// 组件上下文（ComponentRenderer 实例）
 * }
 *
 * 🔄 使用方式：
 * - Provider: <AppContext.Provider value={{...}}>
 * - Consumer: <AppContext.Consumer>{value => ...}</AppContext.Consumer>
 * - Hook: const { appHelper } = useContext(AppContext)
 * - Class: static contextType = AppContext; this.context.appHelper
 *
 * ⚠️ 全局缓存策略：
 * - Context 实例缓存在 window.__appContext
 * - 优点：避免重复创建，确保单例
 * - 缺点：全局污染，多实例场景可能冲突
 *
 * 💡 改进建议：
 * - 使用闭包缓存代替全局变量（见注释的代码）
 * - 支持多实例场景的命名空间隔离
 */

import adapter from '../adapter';

/**
 * 🏭 Context 工厂函数
 *
 * 作用：创建或获取应用级 Context 实例
 *
 * 实现策略：
 * 1. 检查 window.__appContext 是否已存在
 * 2. 如果存在，直接复用（单例模式）
 * 3. 如果不存在，创建新的 Context 并缓存
 *
 * 🔄 调用时机：
 * - base.tsx: 在 BaseRenderer 中使用 AppContext
 * - renderer.tsx: 在 Renderer 中包装 AppContext.Provider
 *
 * 🌍 全局缓存原因：
 * - 确保整个应用共享同一个 Context 实例
 * - 避免 Provider/Consumer 不匹配导致的数据传递失败
 *
 * ⚠️ 潜在问题：
 * - 全局变量污染（window.__appContext）
 * - 多个渲染器实例时可能冲突
 * - 不同 iframe 之间的 Context 隔离问题
 *
 * @returns React.Context - 应用级 Context 实例
 */
export default function contextFactory() {
    // 🔧 从适配器获取 createContext 方法
    // 实际调用的是 React.createContext 或其他框架的等价方法
    const {createContext} = adapter.getRuntime();

    // 🔍 尝试从全局缓存获取 Context
    let context = (window as any).__appContext;

    if (!context) {
        // 🆕 缓存不存在，创建新的 Context
        context = createContext({});  // 创建空的 Context（初始值为空对象）

        // 💾 缓存到全局变量
        (window as any).__appContext = context;
    }

    // 📤 返回 Context 实例
    return context;
}



// ========================================
// 💡 改进方案：使用闭包缓存代替全局变量
// ========================================
//
// 优点：
// - 避免全局污染
// - 更好的封装性
// - 支持多实例场景
//
// 实现代码：
//
// const contextFactory = (() => {
//   let context = null;  // 闭包变量缓存 Context
//
//   return () => {
//       if (!context) {
//           const {createContext} = adapter.getRuntime();
//           context = createContext({});
//       }
//       return context;
//   };
// })();
//
// export default contextFactory;