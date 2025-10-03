/**
 * ========================================
 * @alilc/lowcode-react-renderer 入口文件
 * ========================================
 *
 * 🎯 核心职责：
 * 1. 将 React 运行时注入到 renderer-core 适配器
 * 2. 注册各种类型的渲染器（Page/Component/Block 等）
 * 3. 配置 Fusion ConfigProvider
 * 4. 创建并导出 ReactRenderer 类
 *
 * 📦 导出的 ReactRenderer 是用户直接使用的类：
 *    import ReactRenderer from '@alilc/lowcode-react-renderer'
 *    <ReactRenderer schema={schema} components={components} />
 *
 * 🔧 依赖关系：
 *    ReactRenderer (本文件)
 *       ↓ 继承
 *    Renderer (来自 renderer-core/renderer.tsx)
 *       ↓ 使用
 *    PageRenderer/ComponentRenderer/BlockRenderer (来自 renderer-core)
 *       ↓ 继承
 *    BaseRenderer (来自 renderer-core/base.tsx - 核心转换引擎)
 */

// 🎨 引入 Fusion ConfigProvider 组件
// 用途：为所有组件提供主题、国际化等全局配置
// 例如：设备类型、语言环境等会通过 ConfigProvider 传递给所有子组件
import ConfigProvider from '@alifd/next/lib/config-provider';

// ⚛️ 引入 React 核心 API
import React, {
    Component,        // React 类组件基类
    PureComponent,    // React 纯组件基类（自动实现 shouldComponentUpdate 浅比较）
    createElement,    // 创建 React 元素的核心方法（JSX 的底层实现）
    createContext,    // 创建 Context 用于跨组件传递数据（如 appHelper、components）
    forwardRef,       // 转发 ref 到子组件（用于 HOC 场景）
    ReactInstance,    // React 实例类型定义
    ContextType,      // Context 类型定义
} from 'react';
import ReactDOM from 'react-dom';

// 📦 引入渲染器核心模块（来自 renderer-core 包）
import {
    adapter,                    // 🔧 适配器：抹平 React/Rax 等不同框架的 API 差异
    pageRendererFactory,        // 🏭 Page 渲染器工厂：创建页面级渲染器类
    componentRendererFactory,   // 🏭 Component 渲染器工厂：创建自定义组件渲染器类
    blockRendererFactory,       // 🏭 Block 渲染器工厂：创建区块渲染器类
    addonRendererFactory,       // 🏭 Addon 渲染器工厂：创建插件渲染器类
    tempRendererFactory,        // 🏭 Temp 渲染器工厂：创建临时渲染器类（下钻编辑）
    rendererFactory,            // 🏭 通用渲染器工厂：创建入口渲染器类（路由分发）
    types,                      // 📝 类型定义
} from '../../renderer-core/src';

// 🌍 全局暴露 React 和 ReactDOM
// 用途：在 iframe 环境中共享 React 实例，避免重复加载
// 场景：模拟器 iframe 通过 window.React 访问父窗口的 React
// 注意：这是低代码引擎特定的设计，避免 iframe 重复打包 React
window.React = React;
(window as any).ReactDom = ReactDOM;

// 🔧 第一步：设置 React 运行时到适配器
// 作用：告诉 renderer-core "我们现在使用 React 框架"
// 效果：renderer-core 内部所有的 adapter.getRuntime().createElement(...) 都会调用 React.createElement
adapter.setRuntime({
    Component,                          // React 类组件构造函数
    PureComponent,                      // React 纯组件构造函数
    createContext,                      // React Context API
    createElement,                      // React.createElement（核心渲染方法）
    forwardRef,                         // React.forwardRef（ref 转发）
    findDOMNode: ReactDOM.findDOMNode,  // ReactDOM.findDOMNode（获取 DOM 节点）
});

// 🎭 第二步：设置各类型渲染器到适配器
// 作用：注册不同类型 Schema 对应的渲染器类
// 映射关系：
//   - schema.componentName === 'Page' → PageRenderer
//   - schema.componentName === 'Component' → ComponentRenderer
//   - schema.componentName === 'Block' → BlockRenderer
//   - schema.componentName === 'Div' → DivRenderer（复用 BlockRenderer）
adapter.setRenderers({
    PageRenderer: pageRendererFactory(),         // 页面渲染器（管理页面级 state、数据源）
    ComponentRenderer: componentRendererFactory(), // 组件渲染器（管理自定义组件）
    BlockRenderer: blockRendererFactory(),       // 区块渲染器（轻量级容器）
    AddonRenderer: addonRendererFactory(),       // 插件渲染器（可通过 appHelper.addons 访问）
    TempRenderer: tempRendererFactory(),         // 临时渲染器（用于下钻编辑场景）
    DivRenderer: blockRendererFactory(),         // Div 渲染器（复用 BlockRenderer）
});

// 🎨 第三步：设置 ConfigProvider 组件
// 作用：为所有组件提供全局配置（主题、国际化、设备信息等）
// 使用场景：
//   - 设备类型切换（mobile/desktop）时，ConfigProvider 会传递 device 属性
//   - 语言切换时，ConfigProvider 会传递 locale 属性
adapter.setConfigProvider(ConfigProvider);

/**
 * 🏭 渲染器工厂函数
 *
 * 作用：创建最终导出的 ReactRenderer 类
 *
 * 流程：
 * 1. 调用 rendererFactory() 获取通用渲染器类
 * 2. 继承通用渲染器，添加 React 特定的类型和方法
 * 3. 返回 React 版本的渲染器类
 *
 * @returns ReactRenderer 类（可以直接 new ReactRenderer(...) 使用）
 */
function factory(): types.IRenderComponent {
    // 🔥 获取通用渲染器类（来自 renderer-core/renderer.tsx）
    // 该类负责：
    //   - Schema 结构验证
    //   - 根据 componentName 选择对应的渲染器
    //   - 包装 AppContext 和 ConfigProvider
    //   - 错误边界处理
    const Renderer = rendererFactory();

    /**
     * 🎯 ReactRenderer 类
     * 这是用户直接使用的类，继承自通用 Renderer
     *
     * 特点：
     * - 实现了 React Component 接口
     * - 提供了 React 特定的类型定义
     * - 验证组件是否为 React 组件
     */
    return class ReactRenderer extends Renderer implements Component {
        // 📝 只读属性：渲染器的配置
        readonly props: types.IRendererProps;

        // 🌍 Context 类型（来自 AppContext）
        context: ContextType<any>;

        // 🔄 setState 方法（React 标准 API）
        setState: (state: types.IRendererState, callback?: () => void) => void;

        // ⚡ forceUpdate 方法（React 标准 API）
        forceUpdate: (callback?: () => void) => void;

        // 📦 refs 映射表（React 标准 API）
        refs: {
            [key: string]: ReactInstance;
        };

        /**
         * 🏗️ 构造函数
         *
         * @param props - 渲染器属性（schema、components、appHelper 等）
         * @param context - React Context 上下文
         */
        constructor(props: types.IRendererProps, context: ContextType<any>) {
            super(props, context); // 调用父类构造函数
        }

        /**
         * ✅ 验证是否为有效的 React 组件
         *
         * 检查依据：
         * 1. obj?.prototype?.isReactComponent === true（React 类组件标志）
         * 2. obj?.prototype instanceof Component（继承自 React.Component）
         *
         * 用途：在渲染前验证组件的有效性，防止渲染非 React 组件导致错误
         *
         * @param obj - 待验证的组件
         * @returns boolean - true 表示是有效的 React 组件
         */
        isValidComponent(obj: any) {
            return obj?.prototype?.isReactComponent || obj?.prototype instanceof Component;
        }
    };
}

// 📤 导出 ReactRenderer 类（工厂函数立即执行）
// 用户代码中：import ReactRenderer from '@alilc/lowcode-react-renderer'
// 实际获得的就是这个 ReactRenderer 类
export default factory();
