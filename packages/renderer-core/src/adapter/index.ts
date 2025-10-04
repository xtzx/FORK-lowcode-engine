/**
 * ========================================
 * 框架适配器模块
 * ========================================
 *
 * 🎯 核心职责：
 * 采用适配器设计模式，抹平不同前端框架（React/Rax/Vue）的 API 差异
 * 让 renderer-core 的核心代码保持框架无关，提升代码复用性
 *
 * 📐 设计模式：适配器模式（Adapter Pattern）
 *
 * 🔄 工作原理：
 * 1. 定义统一的 IRuntime 接口（Component、createElement 等）
 * 2. 不同框架通过 setRuntime() 注入各自的实现
 * 3. renderer-core 统一通过 getRuntime() 获取运行时 API
 * 4. 实现一次编写，多框架运行
 *
 * 💡 实际应用：
 * - React 环境：adapter.setRuntime({ Component: React.Component, ... })
 * - Rax 环境：adapter.setRuntime({ Component: Rax.Component, ... })
 * - renderer-core 代码：adapter.getRuntime().createElement(...)
 *   → 自动调用对应框架的 API
 */

import {IRuntime, IRendererModules, IGeneralConstructor} from '../types';

// 🏷️ 环境枚举：支持的框架类型
export enum Env {
    React = 'react',  // React 框架
    // Rax = 'rax',   // Rax 框架（已在 v1.3.0 废弃）
}

/**
 * 🔧 Adapter 适配器类
 *
 * 作用：
 * 1. 管理运行时环境（Component、createElement 等框架 API）
 * 2. 管理渲染器映射（PageRenderer、ComponentRenderer 等）
 * 3. 管理配置提供者（ConfigProvider）
 * 4. 提供统一的访问接口
 *
 * 💡 设计思路：
 * - 通过依赖注入，将具体框架的实现注入到适配器
 * - renderer-core 代码只依赖适配器接口，不依赖具体框架
 * - 实现了框架的可插拔性
 *
 * ⚠️ 当前限制：
 * - Component、PureComponent、createElement 等 API 高度耦合 React
 * - 如果要支持 Vue 等差异较大的框架，需要重新设计更抽象的接口
 */
class Adapter {
    // 🔧 运行时对象：存储当前框架的核心 API
    // 包含：Component、PureComponent、createElement、createContext、forwardRef、findDOMNode
    // 默认值：空实现（占位符），真实值通过 setRuntime() 注入
    runtime: IRuntime;

    // ✅ 内置模块列表：运行时必须提供的 API 清单
    // 用于验证注入的运行时是否完整
    // 说明：这些是 renderer-core 依赖的最小 API 集合
    builtinModules = [
        'Component',      // 类组件基类
        'PureComponent',  // 纯组件基类
        'createElement',  // 创建元素方法
        'createContext',  // 创建 Context 方法
        'forwardRef',     // ref 转发方法
        'findDOMNode',    // 查找 DOM 节点方法
    ];

    // 🏷️ 环境标识：当前使用的框架类型（React/Rax 等）
    env: Env;

    // 🎭 渲染器映射表：存储不同类型 Schema 对应的渲染器类
    // 映射关系：
    //   - PageRenderer: 渲染 componentName === 'Page' 的 Schema
    //   - ComponentRenderer: 渲染 componentName === 'Component' 的 Schema
    //   - BlockRenderer: 渲染 componentName === 'Block' 的 Schema
    //   - 等等...
    renderers: IRendererModules;

    // 🎨 配置提供者组件：用于全局配置传递（如 Fusion ConfigProvider）
    // 作用：为所有组件提供主题、国际化、设备类型等全局配置
    configProvider: any;

    /**
     * 🏗️ 构造函数
     * 初始化适配器，创建默认的空运行时
     */
    constructor() {
        this.initRuntime(); // 创建占位符运行时
    }

    /**
     * 🔧 初始化运行时环境
     *
     * 作用：创建默认的空实现，作为占位符
     * 目的：避免在真实运行时注入前访问报错
     *
     * ⚠️ 注意：这些都是空函数，真实实现需要通过 setRuntime() 注入
     */
    initRuntime() {
        // 📦 Component 类：模拟类组件的基本结构
        const Component: IGeneralConstructor = class<T = any, S = any> {
            state: Readonly<S>;                              // 组件状态
            props: Readonly<T> & Readonly<{children?: any | undefined}>; // 组件属性
            refs: Record<string, unknown>;                   // ref 映射表
            context: Record<string, unknown>;                // Context 上下文
            setState() {}                                    // 空实现
            forceUpdate() {}                                 // 空实现
            render() {}                                      // 空实现
        };

        // 📦 PureComponent 类：模拟纯组件的基本结构
        const PureComponent = class<T = any, S = any> {
            state: Readonly<S>;
            props: Readonly<T> & Readonly<{children?: any | undefined}>;
            refs: Record<string, unknown>;
            context: Record<string, unknown>;
            setState() {}
            forceUpdate() {}
            render() {}
        };

        // 🔧 空函数占位符
        const createElement = () => {};   // 创建元素
        const createContext = () => {};   // 创建 Context
        const forwardRef = () => {};      // ref 转发
        const findDOMNode = () => {};     // 查找 DOM

        // 💾 保存到 runtime 对象
        this.runtime = {
            Component,
            PureComponent,
            createElement,
            createContext,
            forwardRef,
            findDOMNode,
        };
    }

    /**
     * 🔧 设置真实的运行时环境
     *
     * 作用：注入具体框架的 API 实现（如 React.Component、React.createElement）
     *
     * 验证：必须通过 isValidRuntime() 验证，确保包含所有必需的 API
     *
     * 使用示例：
     * adapter.setRuntime({
     *   Component: React.Component,
     *   PureComponent: React.PureComponent,
     *   createElement: React.createElement,
     *   ...
     * });
     *
     * @param runtime - 框架的运行时 API 对象
     */
    setRuntime(runtime: IRuntime) {
        if (this.isValidRuntime(runtime)) {
            this.runtime = runtime; // 替换默认的空实现
        }
    }

    /**
     * ✅ 验证运行时对象是否有效
     *
     * 作用：检查注入的运行时是否包含所有必需的 API
     *
     * 验证规则：
     * 1. 必须是对象类型（不能是数组）
     * 2. 必须包含 builtinModules 中定义的所有 API
     *
     * ⚠️ 严格模式：缺少任何一个必需 API 都会抛出错误
     *
     * @param runtime - 待验证的运行时对象
     * @returns boolean - true 表示有效
     * @throws Error - 缺少必需模块时抛出错误
     */
    isValidRuntime(runtime: IRuntime) {
        // 🚫 类型检查：必须是对象
        if (typeof runtime !== 'object' || Array.isArray(runtime)) {
            return false;
        }

        // ✅ 逐个检查必需模块
        return this.builtinModules.every((m) => {
            const flag = !!runtime[m]; // 检查模块是否存在

            if (!flag) {
                // 🚨 缺少模块，抛出错误
                throw new Error(`runtime is invalid, module '${m}' does not exist`);
            }

            return flag;
        });
    }

    /**
     * 📦 获取当前的运行时对象
     *
     * 作用：提供统一的运行时 API 访问接口
     *
     * 使用场景：
     * - renderer-core 内部通过此方法获取框架 API
     * - 例如：adapter.getRuntime().createElement(...) → React.createElement(...)
     *
     * @returns IRuntime - 当前框架的运行时 API 对象
     */
    getRuntime() {
        return this.runtime;
    }

    /**
     * 🏷️ 设置环境标识
     *
     * @param env - 环境枚举值（Env.React 等）
     */
    setEnv(env: Env) {
        this.env = env;
    }

    /**
     * 🔍 判断是否为 React 环境
     *
     * @returns boolean - true 表示当前使用 React 框架
     */
    isReact() {
        return this.env === Env.React;
    }

    /**
     * 🎭 设置渲染器映射表
     *
     * 作用：注册不同类型 Schema 对应的渲染器类
     *
     * 映射关系：
     * - PageRenderer: 处理 componentName === 'Page'
     * - ComponentRenderer: 处理 componentName === 'Component'
     * - BlockRenderer: 处理 componentName === 'Block'
     * - 等等...
     *
     * 调用时机：在 react-renderer/src/index.ts 中调用
     *
     * @param renderers - 渲染器映射对象
     */
    setRenderers(renderers: IRendererModules) {
        this.renderers = renderers;
    }

    /**
     * 📦 获取渲染器映射表
     *
     * 作用：供 renderer.tsx 查找对应的渲染器类
     *
     * 使用场景：
     * const RENDERER_COMPS = adapter.getRenderers();
     * const Comp = RENDERER_COMPS['PageRenderer']; // 获取 Page 渲染器
     *
     * @returns IRendererModules - 渲染器映射对象
     */
    getRenderers() {
        return this.renderers || {};
    }

    /**
     * 🎨 设置配置提供者组件
     *
     * 作用：注册全局配置组件（如 Fusion ConfigProvider）
     *
     * ConfigProvider 的作用：
     * - 为所有子组件提供主题配置
     * - 传递设备类型、语言环境等全局信息
     * - 统一管理组件的全局行为
     *
     * @param Comp - ConfigProvider 组件类
     */
    setConfigProvider(Comp: any) {
        this.configProvider = Comp;
    }

    /**
     * 📦 获取配置提供者组件
     *
     * @returns ConfigProvider 组件类或 undefined
     */
    getConfigProvider() {
        return this.configProvider;
    }
}

// 📤 导出适配器单例
// 注意：这是单例模式，整个应用共享同一个适配器实例
// 优点：全局状态统一管理
// 缺点：多框架并存时可能冲突（但实际场景罕见）
export default new Adapter();
