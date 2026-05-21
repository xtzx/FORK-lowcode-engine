/**
 * ========================================
 * 🛡️ compWrapper - 错误边界 HOC（高阶组件）
 * ========================================
 *
 * 🎯 核心职责：
 * 为低代码渲染的组件包装错误边界（Error Boundary），捕获组件渲染错误
 * 防止单个组件错误导致整个应用崩溃
 *
 * 🔥 主要功能：
 * 1. **错误捕获**：通过 componentDidCatch 捕获子组件渲染错误
 * 2. **错误展示**：渲染 FaultComponent 显示友好的错误提示
 * 3. **函数组件适配**：将函数组件转换为类组件（因为错误边界只能用类组件）
 * 4. **性能优化**：缓存包装后的组件，避免重复创建
 * 5. **跨框架支持**：兼容 React 和 Rax 框架
 *
 * 🔄 工作流程：
 * 1. 判断组件类型（类组件 or 函数组件）
 * 2. 类组件：直接修改 prototype，注入错误处理逻辑
 * 3. 函数组件：包装为类组件，再注入错误处理逻辑
 * 4. 缓存包装后的组件，提升性能
 *
 * 📦 应用场景：
 * - 所有环境（设计态 + 运行态）
 * - 保护每个低代码组件的独立性
 * - 提供错误隔离和降级能力
 *
 * ⚠️ 技术细节：
 * - 使用原型链修改（prototype）实现 AOP（面向切面编程）
 * - 劫持 componentDidCatch、render、shouldComponentUpdate 三个生命周期
 * - 通过 state.engineRenderError 标记错误状态
 *
 * 🔗 相关文件：
 * - leaf.tsx: 设计态响应式更新 HOC（配合使用）
 * - base.tsx: __getHOCWrappedComponent 方法调用 compWrapper
 */

// 🔧 导入工具函数：克隆组件的可枚举属性（displayName、propTypes 等）
import { cloneEnumerableProperty } from '@alilc/lowcode-utils';
// 🔧 导入适配器：获取 React/Rax 运行时 API
import adapter from '../adapter';
// 📦 导入类型定义
import { IBaseRendererInstance, IRendererProps } from '../types';

/**
 * 🔧 patchDidCatch 的配置项
 */
interface Options {
  baseRenderer: IBaseRendererInstance;  // 渲染器实例（PageRenderer、ComponentRenderer 等）
  schema: any;                          // 组件的 Schema 配置
}

/**
 * 🔨 patchDidCatch - 为组件注入错误处理能力
 *
 * 作用：
 * 修改组件的原型链（prototype），劫持三个关键生命周期方法：
 * 1. componentDidCatch：捕获错误
 * 2. render：错误时渲染 FaultComponent
 * 3. shouldComponentUpdate：错误时强制更新
 *
 * 技术实现：
 * - AOP（面向切面编程）：在不修改原组件代码的前提下，增强其功能
 * - 原型链修改：直接修改 Comp.prototype，影响所有实例
 * - 防重复 patch：通过 patchedCatch 标记避免重复修改
 *
 * @param Comp - 要增强的组件类
 * @param options - 配置项（包含 baseRenderer 和 schema）
 *
 * 调用时机：
 * - compWrapper 中调用
 * - 对类组件和包装后的函数组件都会调用
 */
function patchDidCatch(Comp: any, { baseRenderer }: Options) {
  // 🔍 防止重复 patch：如果已经 patch 过，直接返回
  // 避免多次修改导致的性能问题和逻辑错误
  if (Comp.patchedCatch) {
    return;
  }

  // ✅ 标记为已 patch
  Comp.patchedCatch = true;

  // 🔧 获取 PureComponent 类（用于后续类型判断）
  const { PureComponent } = adapter.getRuntime();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【劫持 1】componentDidCatch - 捕获错误
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Rax 的 getDerivedStateFromError 有 BUG，这里先用 componentDidCatch 来替代
  // @see https://github.com/alibaba/rax/issues/2211

  // 💾 保存原始的 componentDidCatch 方法（如果有）
  const originalDidCatch = Comp.prototype.componentDidCatch;

  // 🔨 劫持 componentDidCatch 方法
  Comp.prototype.componentDidCatch = function didCatch(this: any, error: Error, errorInfo: any) {
    // 1️⃣ 设置错误状态
    // engineRenderError: true 表示组件进入错误状态
    // error: 错误对象（用于后续展示）
    this.setState({ engineRenderError: true, error });

    // 2️⃣ 如果原组件有 componentDidCatch，保留其功能
    // 不破坏用户自定义的错误处理逻辑
    if (originalDidCatch && typeof originalDidCatch === 'function') {
      originalDidCatch.call(this, error, errorInfo);
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【劫持 2】render - 错误时渲染 FaultComponent
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 🔧 获取渲染引擎（用于创建 FaultComponent）
  const { engine } = baseRenderer.context;

  // 💾 保存原始的 render 方法
  const originRender = Comp.prototype.render;

  // 🔨 劫持 render 方法
  Comp.prototype.render = function () {
    // 🚨 检查是否处于错误状态
    if (this.state && this.state.engineRenderError) {
      // 1️⃣ 重置错误标记（避免下次渲染还是错误状态）
      this.state.engineRenderError = false;

      // 2️⃣ 渲染 FaultComponent（错误提示组件）
      // 显示友好的错误信息，而不是白屏
      return engine.createElement(engine.getFaultComponent(), {
        ...this.props,                     // 透传原组件的 props
        error: this.state.error,           // 传递错误对象
        componentName: this.props._componentName,  // 传递组件名称（用于错误提示）
      });
    }

    // ✅ 正常状态：调用原始的 render 方法
    return originRender.call(this);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【劫持 3】shouldComponentUpdate - 错误时强制更新
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 🔍 判断组件是否是 PureComponent
  // PureComponent 默认会做浅比较优化，可能阻止错误渲染
  if (!(Comp.prototype instanceof PureComponent)) {
    // 💾 保存原始的 shouldComponentUpdate 方法
    const originShouldComponentUpdate = Comp.prototype.shouldComponentUpdate;

    // 🔨 劫持 shouldComponentUpdate 方法
    Comp.prototype.shouldComponentUpdate = function (nextProps: IRendererProps, nextState: any) {
      // 🚨 如果下一个状态包含错误标记
      if (nextState && nextState.engineRenderError) {
        // 强制返回 true，确保组件重新渲染（显示错误提示）
        // 否则 PureComponent 可能因为 props 没变而不渲染
        return true;
      }

      // ✅ 正常情况：保留原逻辑
      // 如果原组件有 shouldComponentUpdate，调用它
      // 否则默认返回 true（总是更新）
      return originShouldComponentUpdate
        ? originShouldComponentUpdate.call(this, nextProps, nextState)
        : true;
    };
  }
}

/**
 * 🗂️ 组件缓存 Map
 *
 * 作用：缓存包装后的组件，避免重复创建
 *
 * 数据结构：
 * key: schema.id（组件的唯一标识）
 * value: { Comp, WrapperComponent }
 *   - Comp: 原始组件类（用于判断是否需要重新包装）
 *   - WrapperComponent: 包装后的组件（直接返回，提升性能）
 *
 * 使用场景：
 * - 函数组件转类组件后的缓存
 * - 避免每次渲染都创建新的 Wrapper 类
 *
 * 缓存失效条件：
 * - schema.id 变化（不同组件）
 * - Comp 变化（组件类发生变化）
 */
const cache = new Map<string, { Comp: any; WrapperComponent: any }>();

/**
 * 🛡️ compWrapper - 错误边界 HOC 的主函数
 *
 * 作用：
 * 为组件包装错误边界，实现错误隔离和降级
 *
 * 处理逻辑：
 * 1. 类组件（Class Component）：
 *    - 直接调用 patchDidCatch 修改原型
 *    - 返回原组件（已增强）
 *
 * 2. 函数组件（Function Component）：
 *    - 创建 Wrapper 类组件包装原函数组件
 *    - 调用 patchDidCatch 为 Wrapper 注入错误处理
 *    - 包装 forwardRef 支持 ref 转发
 *    - 缓存包装后的组件
 *
 * @param Comp - 要包装的组件（类组件 or 函数组件）
 * @param options - 配置项（包含 baseRenderer 和 schema）
 * @returns 包装后的组件（已注入错误边界）
 *
 * 技术细节：
 * - 为什么函数组件要转类组件？
 *   因为 componentDidCatch 只能在类组件中使用
 * - 为什么需要 forwardRef？
 *   保持 ref 转发能力，不破坏组件的 ref 功能
 * - 为什么需要 cloneEnumerableProperty？
 *   保持原组件的静态属性（displayName、propTypes 等）
 */
export function compWrapper(Comp: any, options: Options) {
  // 🔧 从适配器获取 React/Rax 运行时 API
  const { createElement, Component, forwardRef } = adapter.getRuntime();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【分支 1】类组件处理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 🔍 判断是否是类组件
  // 判断条件（满足任一即可）：
  // 1. Comp.prototype.isReactComponent === true（React 类组件标识）
  // 2. Comp.prototype.setState 存在（Rax 类组件标识）
  // 3. Comp.prototype instanceof Component（继承自 Component）
  if (
    Comp?.prototype?.isReactComponent || // react
    Comp?.prototype?.setState || // rax
    Comp?.prototype instanceof Component
  ) {
    // ✅ 类组件：直接 patch 原型，注入错误处理
    patchDidCatch(Comp, options);

    // 🔙 返回原组件（已被 patchDidCatch 增强）
    return Comp;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【分支 2】函数组件处理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 🔍 检查缓存：避免重复创建 Wrapper
  // 缓存命中条件：
  // 1. cache 中存在 schema.id 对应的记录
  // 2. 缓存的 Comp 和当前 Comp 是同一个（引用相等）
  if (cache.has(options.schema.id) && cache.get(options.schema.id)?.Comp === Comp) {
    // 🚀 返回缓存的 WrapperComponent（提升性能）
    return cache.get(options.schema.id)?.WrapperComponent;
  }

  // 🏗️ 创建 Wrapper 类组件
  // 作用：将函数组件转换为类组件，以便使用 componentDidCatch
  class Wrapper extends Component {
    render() {
      // 📤 渲染原函数组件
      // 透传所有 props，并转发 ref（通过 forwardRef 传入的 ref）
      return createElement(Comp, { ...this.props, ref: this.props.forwardRef });
    }
  }

  // 🏷️ 保持原组件的 displayName（用于 React DevTools 调试）
  (Wrapper as any).displayName = Comp.displayName;

  // 🛡️ 为 Wrapper 注入错误处理能力
  patchDidCatch(Wrapper, options);

  // 🔄 包装 forwardRef：支持 ref 转发
  // cloneEnumerableProperty：复制原组件的静态属性到 forwardRef 组件
  // 保持 displayName、propTypes、defaultProps 等属性
  const WrapperComponent = cloneEnumerableProperty(
    forwardRef((props: any, ref: any) => {
      // 📤 创建 Wrapper 实例
      // 将外部的 ref 作为 forwardRef prop 传递给 Wrapper
      // Wrapper 再将其传递给原函数组件
      return createElement(Wrapper, { ...props, forwardedRef: ref });
    }),
    Comp,  // 从原组件复制静态属性
  );

  // 💾 缓存 WrapperComponent
  // 下次遇到同样的 schema.id 和 Comp，直接返回缓存
  cache.set(options.schema.id, { WrapperComponent, Comp });

  // 🔙 返回包装后的组件
  return WrapperComponent;
}
