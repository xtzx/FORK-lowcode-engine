import {IRuntime, IRendererModules, IGeneralConstructor} from '../types';

export enum Env {
    React = 'react',
}

/**
 * Adapter 类作为一个适配器模式的实现，主要负责在不同的环境（如 React）之间提供统一的接口。
 * 初始化和管理运行时环境，包括组件的创建、环境设置、渲染器的配置等，使得上层应用可以不依赖于具体的框架而进行开发。
 *
 * 看起来只有 setRenderers 是有点意义的
 * 其他比如  Component, PureComponent, createElement 都太偏向 react 语法,难以磨平差异实现适配
 * 应该创建一组更抽象的接口，这些接口不依赖于任何特定框架的实现细节，从而实现真正的框架无关性
 */
class Adapter {
    // 存储运行时对象，包括 React 组件的基本构造函数和其他 React 相关的方法，如 createElement 和 forwardRef。
    runtime: IRuntime;

    // 预定义的模块名称数组，用于验证运行时对象是否包含这些必要的模块。
    builtinModules = ['Component', 'PureComponent', 'createElement', 'createContext', 'forwardRef', 'findDOMNode'];

    // 枚举类型，用于标识当前环境（例如 React）。
    env: Env;

    // 存储与渲染相关的模块，可能包括特定于环境的渲染器。
    renderers: IRendererModules;

    configProvider: any;

    constructor() {
        this.initRuntime();
    }

    /**
     * 初始化运行时环境，创建基本的 React 组件类和其他方法如 createElement。
     */
    initRuntime() {
        const Component: IGeneralConstructor = class<T = any, S = any> {
            state: Readonly<S>;
            props: Readonly<T> & Readonly<{children?: any | undefined}>;
            refs: Record<string, unknown>;
            context: Record<string, unknown>;
            setState() {}
            forceUpdate() {}
            render() {}
        };

        const PureComponent = class<T = any, S = any> {
            state: Readonly<S>;
            props: Readonly<T> & Readonly<{children?: any | undefined}>;
            refs: Record<string, unknown>;
            context: Record<string, unknown>;
            setState() {}
            forceUpdate() {}
            render() {}
        };

        const createElement = () => {};
        const createContext = () => {};
        const forwardRef = () => {};
        const findDOMNode = () => {};

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
     * 设置自定义的运行时环境，前提是通过 isValidRuntime 验证。
     */
    setRuntime(runtime: IRuntime) {
        if (this.isValidRuntime(runtime)) {
            this.runtime = runtime;
        }
    }

    /**
     * 验证传入的运行时对象是否有效，即是否包含所有必要的模块。
     */
    isValidRuntime(runtime: IRuntime) {
        if (typeof runtime !== 'object' || Array.isArray(runtime)) {
            return false;
        }

        // runtime 需要包含 builtinModules 中全部定义的模块
        return this.builtinModules.every((m) => {
            const flag = !!runtime[m];

            // 如果运行时对象不包含必要的模块，会抛出错误。
            // 这种做法虽然可以快速发现问题，但在某些情况下可能希望有更灵活的处理方式，比如返回错误信息而不是直接抛出异常。
            if (!flag) {
                throw new Error(`runtime is invalid, module '${m}' does not exist`);
            }

            return flag;
        });
    }

    /**
     * 获取当前的运行时对象
     */
    getRuntime() {
        return this.runtime;
    }

    setEnv(env: Env) {
        this.env = env;
    }

    isReact() {
        return this.env === Env.React;
    }

    setRenderers(renderers: IRendererModules) {
        this.renderers = renderers;
    }

    /**
     * 返回集合,支持各种类型模块的渲染
     */
    getRenderers() {
        return this.renderers || {};
    }

    setConfigProvider(Comp: any) {
        this.configProvider = Comp;
    }

    getConfigProvider() {
        return this.configProvider;
    }
}

export default new Adapter();
