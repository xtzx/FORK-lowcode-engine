/**
 * ========================================
 * 🍃 LeafWrapper - 设计态响应式更新包装器
 * ========================================
 *
 * 🎯 核心职责：
 * 在设计态（designMode === 'design'）下，为每个组件包装一个 HOC（高阶组件）
 * 实现组件的响应式更新，当 Schema 变化时，自动触发对应组件的重渲染
 *
 * 🔥 主要功能：
 * 1. **监听 Schema 变化**：props、children、visible、condition 等
 * 2. **最小渲染单元优化**：只重渲染变化的组件，不重渲染整个页面
 * 3. **性能优化**：使用 debounce 防抖、缓存机制
 * 4. **设计器集成**：提供 _leaf 属性，连接设计器的 Node 对象
 *
 * 🔄 工作流程：
 * 1. 用户在设计器中修改组件属性
 * 2. 设计器触发 Node.onPropChange 事件
 * 3. LeafWrapper 监听到事件，调用 setState 更新 nodeProps
 * 4. React 重渲染该组件（不影响其他组件）
 *
 * ⚠️ 注意：
 * - **只在设计态使用**：运行态（生产环境）不会应用此 HOC，直接渲染原组件
 * - **性能关键**：实现了最小渲染单元，避免全页面重渲染
 *
 * 📦 使用场景：
 * - 低代码编辑器的画布区域
 * - 实时预览功能
 * - Schema 可视化编辑
 */

import { INode, IPublicTypePropChangeOptions } from '@alilc/lowcode-designer';
import { GlobalEvent, IPublicEnumTransformStage, IPublicTypeNodeSchema, IPublicTypeEngineOptions } from '@alilc/lowcode-types';
import { isReactComponent, cloneEnumerableProperty } from '@alilc/lowcode-utils';
import { debounce } from '../utils/common';
import adapter from '../adapter';
import * as types from '../types/index';
import logger from '../utils/logger';

/**
 * 组件 HOC 信息
 * 传递给 leafWrapper 的参数
 */
export interface IComponentHocInfo {
  schema: any;                                // Schema 对象
  baseRenderer: types.IBaseRendererInstance;  // 渲染器实例（PageRenderer/ComponentRenderer等）
  componentInfo: any;                         // 组件元信息（来自 setter 配置）
  scope: any;                                 // 作用域对象（包含 props、state、this 等）
}

/**
 * 组件 HOC 的 Props
 */
export interface IComponentHocProps {
  __tag: any;         // 随机标识（设计态每次渲染都会变化，用于强制更新）
  componentId: any;   // 组件 ID（对应 schema.id）
  _leaf: any;         // 🔥 设计器 Node 对象（连接设计器和渲染器的桥梁）
  forwardedRef?: any; // 转发的 ref
}

/**
 * 组件 HOC 的 State
 */
export interface IComponentHocState {
  childrenInState: boolean; // children 是否存储在 state 中
  nodeChildren: any;        // 子节点（从 _leaf 解析出来）
  nodeCacheProps: any;      // 缓存的 props（用于对比是否变化）

  /** 控制是否显示隐藏（对应 schema.hidden）*/
  visible: boolean;

  /** 控制是否渲染（对应 schema.condition）*/
  condition: boolean;

  nodeProps: any;  // 组件 props（从 schema.props 解析出来）
}

// 设计模式类型（从 EngineOptions 提取）
type DesignMode = Pick<IPublicTypeEngineOptions, 'designMode'>['designMode'];

/**
 * 组件 HOC 配置
 */
export interface IComponentHoc {
  designMode: DesignMode | DesignMode[];  // 应用此 HOC 的设计模式列表
  hoc: IComponentConstruct;               // HOC 构造函数
}

/**
 * HOC 构造函数类型
 * 接收原组件和信息，返回包装后的组件类
 */
export type IComponentConstruct = (Comp: types.IBaseRenderComponent, info: IComponentHocInfo) => types.IGeneralConstructor;

/**
 * LeafHoc 组件的 Props
 */
interface IProps {
  _leaf: INode | undefined;  // 🔥 设计器 Node 对象（最重要的 prop）

  visible: boolean;          // 是否可见

  componentId: number;       // 组件 ID

  children?: INode[];        // 子节点列表

  __tag: number;             // 随机标识（用于强制更新）

  forwardedRef?: any;        // 转发的 ref
}

/**
 * 重渲染类型枚举
 * 用于性能分析和调试
 */
enum RerenderType {
  All = 'All',                         // 全量渲染
  ChildChanged = 'ChildChanged',       // 子节点变化
  PropsChanged = 'PropsChanged',       // 属性变化
  VisibleChanged = 'VisibleChanged',   // 可见性变化
  MinimalRenderUnit = 'MinimalRenderUnit', // 最小渲染单元（性能优化模式）
}

/**
 * 🗂️ LeafCache 缓存类
 *
 * 作用：在设计态缓存组件相关数据，避免不必要的重新创建和性能问题
 *
 * 为什么需要缓存？
 * 1. **组件缓存（component）**：避免每次渲染都创建新的 LeafWrapper 类
 * 2. **状态缓存（state）**：保持组件状态，即使组件被销毁重建
 * 3. **事件缓存（event）**：管理事件监听器的生命周期
 * 4. **引用缓存（ref）**：存储组件方法引用（如 makeUnitRender）
 *
 * 缓存粒度：documentId + device
 * - 不同文档独立缓存
 * - 不同设备（desktop/mobile）独立缓存
 */
class LeafCache {

  /**
   * 组件缓存
   * key: schema.id, value: { Comp, LeafWrapper }
   * 用途：避免重复创建 LeafWrapper 类
   */
  component = new Map();

  /**
   * 状态缓存
   * key: schema.id, value: IComponentHocState
   *
   * 场景：
   * 用户修改组件属性 → 组件被销毁重建 → 如果没有缓存，state 会丢失 → 修改的属性看不到
   * 有了缓存 → 重建时恢复上次的 state → 修改的属性能正常显示
   */
  state = new Map();

  /**
   * 订阅事件缓存
   * key: schema.id, value: { clear: boolean, dispose: Function[] }
   *
   * 用途：
   * - 记录每个组件订阅的事件监听器
   * - 组件卸载时自动清理，防止内存泄漏
   */
  event = new Map();

  /**
   * 引用缓存
   * key: schema.id, value: { makeUnitRender: Function }
   *
   * 用途：
   * - 存储最小渲染单元的触发方法
   * - 外部可调用触发局部渲染
   */
  ref = new Map();

  /**
   * 构造函数
   * @param documentId - 文档 ID（不同文档独立缓存）
   * @param device - 设备类型（desktop/mobile 独立缓存）
   */
  constructor(public documentId: string, public device: string) {
  }
}

let cache: LeafCache;

/**
 * 🔄 initRerenderEvent - 初始化重渲染事件（兜底方案）
 *
 * 作用：
 * 为没有被 LeafWrapper 包装的节点设置事件监听
 * 确保所有节点变化都能触发重渲染
 *
 * 应用场景：
 * - 部分节点因为某些原因没有渲染 LeafWrapper
 * - 作为兜底方案，确保这些节点的变化也能被响应
 *
 * 工作原理：
 * 1. 检查节点是否已经有监听器
 * 2. 如果没有，注册三个事件监听器
 * 3. 任何事件触发时，调用 container.rerender() 重渲染整个容器
 *
 * ⚠️ 注意：
 * - 这是全局重渲染（性能较差）
 * - LeafWrapper 是局部重渲染（性能较好）
 * - 所以优先使用 LeafWrapper，此函数是兜底方案
 */
function initRerenderEvent({
  schema,    // 组件 Schema
  __debug,   // 调试方法
  container, // 容器对象（提供 rerender 方法）
  getNode,   // 获取 Node 对象的方法
}: any) {
  // 🔍 获取设计器 Node 对象
  const leaf = getNode?.(schema.id);

  // 🛑 三种情况直接返回（不需要初始化）：
  // 1. leaf 不存在：节点还没创建
  // 2. cache.event.get(schema.id)?.clear === true：监听器已清除
  // 3. leaf === cache.event.get(schema.id)：监听器已存在且是同一个 leaf
  if (!leaf
    || cache.event.get(schema.id)?.clear
    || leaf === cache.event.get(schema.id)
  ) {
    return;
  }

  // 🧹 清理旧的监听器（如果有）
  // 防止重复监听导致的内存泄漏
  cache.event.get(schema.id)?.dispose.forEach((disposeFn: any) => disposeFn && disposeFn());

  // ⏱️ 创建防抖版的重渲染方法
  // 20ms 内的多次调用只执行一次，避免频繁渲染
  const debounceRerender = debounce(() => {
    container.rerender();  // 🚨 重渲染整个容器（全局渲染）
  }, 20);

  // 💾 缓存事件监听器
  cache.event.set(schema.id, {
    clear: false,  // 标记为未清除
    leaf,          // 保存 leaf 引用（用于判断是否变化）
    dispose: [     // 保存清理函数数组（用于组件卸载时清理）
      // 📡 监听器 1：props 变化
      leaf?.onPropChange?.(() => {
        // 🔍 检查是否开启自动重绘
        if (!container.autoRepaintNode) {
          return;
        }
        // 📝 调试日志
        __debug(`${schema.componentName}[${schema.id}] leaf not render in SimulatorRendererView, leaf onPropsChange make rerender`);
        // 🔄 触发重渲染
        debounceRerender();
      }),

      // 📡 监听器 2：children 变化
      leaf?.onChildrenChange?.(() => {
        if (!container.autoRepaintNode) {
          return;
        }
        __debug(`${schema.componentName}[${schema.id}] leaf not render in SimulatorRendererView, leaf onChildrenChange make rerender`);
        debounceRerender();
      }) as Function,

      // 📡 监听器 3：显隐变化
      leaf?.onVisibleChange?.(() => {
        if (!container.autoRepaintNode) {
          return;
        }
        __debug(`${schema.componentName}[${schema.id}] leaf not render in SimulatorRendererView, leaf onVisibleChange make rerender`);
        debounceRerender();
      }),
    ],
  });
}

/**
 * 🧹 clearRerenderEvent - 清除重渲染事件监听器
 *
 * 作用：
 * 清除 initRerenderEvent 注册的事件监听器
 * 防止内存泄漏
 *
 * 调用时机：
 * - LeafHoc 的 constructor 中调用
 * - 表示节点已经被 LeafWrapper 包装，不再需要兜底的全局监听器
 *
 * @param id - 组件 Schema ID
 */
function clearRerenderEvent(id: string): void {
  // 🔍 如果已经清除过，直接返回
  if (cache.event.get(id)?.clear) {
    return;
  }

  // 🧹 执行所有清理函数（取消监听）
  cache.event.get(id)?.dispose?.forEach((disposeFn: any) => disposeFn && disposeFn());

  // ✅ 标记为已清除
  cache.event.set(id, {
    clear: true,
    dispose: [],
  });
}

/**
 * 🍃 leafWrapper - 设计态响应式更新 HOC（核心函数）
 *
 * 作用：
 * 为组件包装 LeafHoc，实现设计态的响应式更新
 *
 * 核心能力：
 * 1. **监听 Schema 变化**：props、children、visible、condition
 * 2. **最小渲染单元**：只重渲染变化的组件，不影响其他组件
 * 3. **状态管理**：缓存组件状态，避免状态丢失
 * 4. **性能优化**：防抖处理、缓存机制
 * 5. **设计器集成**：注入 _leaf 属性，连接设计器 Node 对象
 *
 * 包装结构：
 * forwardRef
 *   └─ LeafHoc (监听变化、状态管理)
 *       └─ OriginalComp (原始组件)
 *
 * @param Comp - 原始组件类
 * @param options - HOC 配置项
 * @returns LeafWrapper（包装后的组件）
 *
 * 技术亮点：
 * - 使用闭包缓存 baseRenderer、scope 等上下文
 * - 使用 Map 缓存组件、状态、事件、引用
 * - 使用防抖优化频繁更新
 * - 使用最小渲染单元减少渲染范围
 */
export function leafWrapper(Comp: types.IBaseRenderComponent, {
  schema,         // 组件 Schema 配置
  baseRenderer,   // 渲染器实例（PageRenderer、ComponentRenderer 等）
  componentInfo,  // 组件元信息（从 setter 配置提取）
  scope,          // 作用域对象（包含 props、state、this 等）
}: IComponentHocInfo) {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【初始化阶段 1】提取依赖和工具方法
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 🔧 从 baseRenderer 提取工具方法
  const {
    __debug,                                    // 调试方法
    __getComponentProps: getProps,              // 解析组件 props
    __getSchemaChildrenVirtualDom: getChildren, // 获取子节点虚拟 DOM
    __parseData,                                // 解析数据（处理 JSExpression 等）
  } = baseRenderer;

  // 🔧 提取上下文对象
  const { engine } = baseRenderer.context;                              // 渲染引擎
  const host = baseRenderer.props?.__host;                              // 设计器 Host 对象
  const curDocumentId = baseRenderer.props?.documentId ?? '';           // 当前文档 ID
  const curDevice = baseRenderer.props?.device ?? '';                   // 当前设备类型（desktop/mobile）
  const getNode = baseRenderer.props?.getNode;                          // 获取 Node 对象的方法
  const container = baseRenderer.props?.__container;                    // 容器对象
  const setSchemaChangedSymbol = baseRenderer.props?.setSchemaChangedSymbol; // 设置 Schema 变化标记
  const editor = host?.designer?.editor;                                // 编辑器对象

  // 🔧 获取 React/Rax 运行时 API
  const runtime = adapter.getRuntime();
  const { forwardRef, createElement } = runtime;
  const Component = runtime.Component as types.IGeneralConstructor<
    IComponentHocProps, IComponentHocState
  >;

  // 📝 组件缓存 ID（使用 schema.id）
  const componentCacheId = schema.id;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【初始化阶段 2】缓存管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 🔍 检查是否需要重新创建缓存
  // 触发条件：
  // 1. cache 不存在（第一次使用）
  // 2. documentId 变化（切换文档）
  // 3. device 变化（切换设备）
  if (!cache || (curDocumentId && curDocumentId !== cache.documentId) || (curDevice && curDevice !== cache.device)) {
    // 🧹 清理旧缓存的所有事件监听器（防止内存泄漏）
    cache?.event.forEach(event => {
      event.dispose?.forEach((disposeFn: any) => disposeFn && disposeFn());
    });

    // 🆕 创建新的缓存实例
    cache = new LeafCache(curDocumentId, curDevice);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【初始化阶段 3】组件验证
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ⚠️ 验证组件是否是有效的 React 组件
  // 如果不是，记录错误日志（不阻止渲染，只是警告）
  if (!isReactComponent(Comp)) {
    logger.error(`${schema.componentName} component may be has errors: `, Comp);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【初始化阶段 4】注册兜底重渲染事件
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 📡 为没有被 LeafWrapper 包装的节点注册全局监听器（兜底方案）
  // 如果节点最终被 LeafWrapper 包装，会在 LeafHoc.constructor 中清除这些监听器
  initRerenderEvent({
    schema,
    __debug,
    container,
    getNode,
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【初始化阶段 5】检查组件缓存
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 🚀 缓存命中：直接返回缓存的 LeafWrapper
  // 缓存命中条件：
  // 1. curDocumentId 存在（设计态）
  // 2. cache.component 中存在对应的记录
  // 3. 缓存的 Comp 和当前 Comp 是同一个（引用相等）
  if (curDocumentId && cache.component.has(componentCacheId) && (cache.component.get(componentCacheId).Comp === Comp)) {
    return cache.component.get(componentCacheId).LeafWrapper;
  }

  /**
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 🍃 LeafHoc 类 - 响应式更新的核心实现
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   *
   * 作用：
   * 包装原始组件，监听设计器的 Schema 变化，实现响应式更新
   *
   * 核心特性：
   * 1. 事件监听：onPropChange、onChildrenChange、onVisibleChange
   * 2. 状态管理：缓存组件状态（nodeProps、nodeChildren、visible、condition）
   * 3. 最小渲染单元：智能判断渲染范围，减少不必要的渲染
   * 4. 性能优化：防抖处理、缓存机制
   */
  class LeafHoc extends Component {
    /**
     * 📊 性能记录信息
     * 用于统计组件渲染耗时和类型
     */
    recordInfo: {
      startTime?: number | null;  // 渲染开始时间
      type?: string;              // 重渲染类型（PropsChanged、ChildChanged 等）
      node?: INode;               // 触发渲染的节点
    } = {};

    /**
     * 🔗 当前事件监听的 leaf 对象
     * 用于判断 leaf 是否发生变化（组件替换场景）
     */
    private curEventLeaf: INode | undefined;

    /**
     * 🏷️ 组件显示名称（用于 React DevTools）
     */
    static displayName = schema.componentName;

    /**
     * 🧹 事件清理函数数组
     * 存储所有监听器的清理函数，组件卸载时统一清理
     */
    disposeFunctions: Array<((() => void) | Function)> = [];

    /**
     * 🏷️ 组件标签（用于识别 LeafWrapper）
     */
    __component_tag = 'leafWrapper';

    /**
     * 📍 最小渲染单元信息
     * 用于优化渲染范围，只重渲染必要的组件
     */
    renderUnitInfo: {
      minimalUnitId?: string;      // 最小渲染单元的 ID
      minimalUnitName?: string;    // 最小渲染单元的组件名
      singleRender?: boolean;      // 是否单组件渲染（true：只渲染自己，false：渲染最小单元）
    };

    /**
     * ⏱️ makeUnitRenderDebounced - 防抖版的最小渲染单元更新方法
     *
     * 作用：
     * 触发最小渲染单元的重渲染（20ms 防抖）
     *
     * 执行流程：
     * 1. 记录渲染开始时间
     * 2. 从 leaf 导出最新的 Schema
     * 3. 重新解析 props 和 children
     * 4. 更新 state，触发重渲染
     *
     * 应用场景：
     * - 用户修改组件属性
     * - 子组件发生变化
     * - 显隐状态变化
     *
     * ⚠️ 注意：
     * - 20ms 内的多次调用会合并为一次
     * - 只更新当前最小渲染单元，不影响其他组件
     */
    makeUnitRenderDebounced = debounce(() => {
      // 📝 记录渲染信息（用于性能统计）
      this.beforeRender(RerenderType.MinimalRenderUnit);

      // 📤 从 leaf 导出最新的 Schema（Render 阶段的 Schema）
      const schema = this.leaf?.export?.(IPublicEnumTransformStage.Render);
      if (!schema) {
        return;
      }

      // 🔧 重新解析 props（根据最新 Schema）
      const nextProps = getProps(schema, scope, Comp, componentInfo);

      // 👶 重新获取子节点（根据最新 Schema）
      const children = getChildren(schema, scope, Comp);

      // 📦 构建新的 state
      const nextState = {
        nodeProps: nextProps,      // 新的 props
        nodeChildren: children,     // 新的 children
        childrenInState: true,      // 标记 children 存储在 state 中
      };

      // 🔄 如果 props 中包含 children，优先使用 props.children
      // 某些组件的 children 来自 props 而不是 schema
      if ('children' in nextProps) {
        nextState.nodeChildren = nextProps.children;
      }

      // 📝 调试日志
      __debug(`${this.leaf?.componentName}(${this.props.componentId}) MinimalRenderUnit Render!`);

      // 🔄 更新 state，触发重渲染
      this.setState(nextState);
    }, 20);

    /**
     * 🏗️ constructor - LeafHoc 构造函数
     *
     * 执行内容：
     * 1. 清除兜底的重渲染事件（因为现在有 LeafWrapper 了）
     * 2. 注册最小渲染单元的触发方法
     * 3. 从缓存恢复状态（避免状态丢失）
     * 4. 初始化 state
     *
     * 状态恢复机制：
     * - 如果缓存中有状态且 __tag 相同，恢复缓存状态
     * - 如果没有缓存或 __tag 不同，创建默认状态
     * - __tag 是每次渲染时生成的随机数，用于判断是否需要重置状态
     *
     * @param props - 组件 props
     * @param context - 组件 context
     */
    constructor(props: IProps, context: any) {
      super(props, context);

      // 📝 调试日志：标记组件已被 LeafWrapper 包装
      __debug(`${schema.componentName}[${this.props.componentId}] leaf render in SimulatorRendererView`);

      // 🧹 清除兜底的重渲染事件
      // 因为组件已经被 LeafWrapper 包装，不再需要全局监听器
      clearRerenderEvent(componentCacheId);

      // 🔗 保存当前的 leaf 引用（用于后续判断是否变化）
      this.curEventLeaf = this.leaf;

      // 💾 注册最小渲染单元的触发方法到缓存
      // 其他组件可以通过 cache.ref.get(id).makeUnitRender() 触发此组件渲染
      cache.ref.set(componentCacheId, {
        makeUnitRender: this.makeUnitRender,
      });

      // 🔄 状态恢复逻辑
      let cacheState = cache.state.get(componentCacheId);

      // 🔍 检查缓存状态是否有效
      // 无效条件：
      // 1. 没有缓存状态
      // 2. 缓存的 __tag 和当前 props.__tag 不同（说明组件已重新创建）
      if (!cacheState || cacheState.__tag !== props.__tag) {
        cacheState = this.getDefaultState(props);
      }

      // ✅ 设置初始状态（从缓存恢复 or 创建默认状态）
      this.state = cacheState;
    }

    /**
     * ⏱️ recordTime - 记录组件渲染耗时
     *
     * 作用：
     * 统计组件渲染性能，发送到编辑器的事件总线
     *
     * 使用场景：
     * - componentDidMount 后调用
     * - componentDidUpdate 后调用
     * - 用于性能分析和优化
     *
     * 发送的数据：
     * - componentName: 组件名称
     * - time: 渲染耗时（毫秒）
     * - type: 渲染类型（PropsChanged、ChildChanged 等）
     * - nodeCount: 文档中的节点总数
     */
    recordTime = () => {
      // 🔍 如果没有记录开始时间，直接返回
      if (!this.recordInfo.startTime) {
        return;
      }

      // ⏱️ 计算渲染耗时
      const endTime = Date.now();

      // 📊 获取节点总数（用于性能分析）
      const nodeCount = host?.designer?.currentDocument?.getNodeCount?.();

      // 🏷️ 获取组件名称
      const componentName = this.recordInfo.node?.componentName || this.leaf?.componentName || 'UnknownComponent';

      // 📡 发送渲染性能事件到编辑器
      editor?.eventBus.emit(GlobalEvent.Node.Rerender, {
        componentName,
        time: endTime - this.recordInfo.startTime,  // 渲染耗时
        type: this.recordInfo.type,                 // 渲染类型
        nodeCount,                                  // 节点总数
      });

      // 🔄 重置开始时间
      this.recordInfo.startTime = null;
    };

    /**
     * 🔄 makeUnitRender - 触发最小渲染单元更新（供外部调用）
     *
     * 作用：
     * 提供给外部组件调用的触发方法
     * 实际调用的是防抖版的 makeUnitRenderDebounced
     *
     * 使用场景：
     * - 最小渲染单元优化：子组件变化时，触发父级最小单元渲染
     * - cache.ref.get(id).makeUnitRender() 方式调用
     */
    makeUnitRender = () => {
      this.makeUnitRenderDebounced();
    };

    /**
     * 🔍 autoRepaintNode - 获取是否开启自动重绘
     *
     * 作用：
     * 检查容器是否开启了自动重绘功能
     * 如果关闭，事件监听器不会触发重渲染
     *
     * @returns boolean - 是否开启自动重绘
     */
    get autoRepaintNode() {
      return container?.autoRepaintNode;
    }

    /**
     * 🔄 componentDidUpdate - React 生命周期：组件更新后
     *
     * 作用：
     * 记录组件更新的性能数据
     */
    componentDidUpdate() {
      this.recordTime();
    }

    /**
     * 🔄 componentDidMount - React 生命周期：组件挂载后
     *
     * 作用：
     * 初始化三个核心事件监听器
     * 1. onPropChange：监听属性变化
     * 2. onChildrenChange：监听子节点变化
     * 3. onVisibleChange：监听显隐变化
     *
     * 执行流程：
     * 1. 获取当前的 leaf 对象
     * 2. 初始化三个事件监听器
     * 3. 记录渲染性能
     */
    componentDidMount() {
      const _leaf = this.leaf;

      // 📡 初始化事件监听器
      this.initOnPropsChangeEvent(_leaf);      // 监听属性变化
      this.initOnChildrenChangeEvent(_leaf);   // 监听子节点变化
      this.initOnVisibleChangeEvent(_leaf);    // 监听显隐变化

      // ⏱️ 记录渲染性能
      this.recordTime();
    }

    /**
     * 🔧 getDefaultState - 获取默认状态
     *
     * 作用：
     * 创建组件的初始状态
     *
     * 状态结构：
     * - nodeChildren: 子节点（初始为 null）
     * - childrenInState: children 是否存储在 state（初始为 false）
     * - visible: 可见性（根据 schema.hidden 计算）
     * - condition: 条件渲染（根据 schema.condition 计算）
     * - nodeCacheProps: 缓存的 props（初始为空对象）
     * - nodeProps: 组件 props（初始为空对象）
     *
     * @param nextProps - 组件 props
     * @returns 默认状态对象
     */
    getDefaultState(nextProps: any) {
      // 🔍 从 props 或 leaf 中提取 hidden 和 condition
      const {
        hidden = false,    // 默认不隐藏
        condition = true,  // 默认满足条件
      } = nextProps.__inner__ || this.leaf?.export?.(IPublicEnumTransformStage.Render) || {};

      return {
        nodeChildren: null,                          // 子节点（初始为 null）
        childrenInState: false,                      // children 不在 state 中
        visible: !hidden,                            // 可见性（hidden 取反）
        condition: __parseData?.(condition, scope),  // 解析条件表达式
        nodeCacheProps: {},                          // 缓存的 props（空对象）
        nodeProps: {},                               // 组件 props（空对象）
      };
    }

    /**
     * 🔄 setState - 重写 React 的 setState 方法
     *
     * 作用：
     * 1. 在更新 state 前，先将 state 缓存到 cache.state
     * 2. 确保组件重建时能恢复状态
     * 3. 调用父类的 setState 触发重渲染
     *
     * 缓存机制：
     * - 缓存 key: componentCacheId（schema.id）
     * - 缓存内容: 合并后的完整 state + __tag
     * - __tag: 用于判断缓存是否有效
     *
     * @param state - 要更新的状态
     */
    setState(state: any) {
      // 💾 缓存状态到 cache.state
      cache.state.set(componentCacheId, {
        ...this.state,        // 保留原有状态
        ...state,             // 合并新状态
        __tag: this.props.__tag,  // 保存 __tag（用于判断缓存有效性）
      });

      // 🔄 调用父类 setState，触发重渲染
      super.setState(state);
    }

    /** 由于内部属性变化，在触发渲染前，会执行该函数 */
    beforeRender(type: string, node?: INode): void {
      this.recordInfo.startTime = Date.now();
      this.recordInfo.type = type;
      this.recordInfo.node = node;
      setSchemaChangedSymbol?.(true);
    }

    judgeMiniUnitRender() {
      if (!this.renderUnitInfo) {
        this.getRenderUnitInfo();
      }

      const renderUnitInfo = this.renderUnitInfo || {
        singleRender: true,
      };

      if (renderUnitInfo.singleRender) {
        return;
      }

      const ref = cache.ref.get(renderUnitInfo.minimalUnitId);

      if (!ref) {
        __debug('Cant find minimalRenderUnit ref! This make rerender!');
        container?.rerender();
        return;
      }
      __debug(`${this.leaf?.componentName}(${this.props.componentId}) need render, make its minimalRenderUnit ${renderUnitInfo.minimalUnitName}(${renderUnitInfo.minimalUnitId})`);
      ref.makeUnitRender();
    }

    getRenderUnitInfo(leaf = this.leaf) {
      // leaf 在低代码组件中存在 mock 的情况，退出最小渲染单元判断
      if (!leaf || typeof leaf.isRoot !== 'function') {
        return;
      }

      if (leaf.isRootNode) {
        this.renderUnitInfo = {
          singleRender: true,
          ...(this.renderUnitInfo || {}),
        };
      }
      if (leaf.componentMeta.isMinimalRenderUnit) {
        this.renderUnitInfo = {
          minimalUnitId: leaf.id,
          minimalUnitName: leaf.componentName,
          singleRender: false,
        };
      }
      if (leaf.hasLoop()) {
        // 含有循环配置的元素，父元素是最小渲染单元
        this.renderUnitInfo = {
          minimalUnitId: leaf?.parent?.id,
          minimalUnitName: leaf?.parent?.componentName,
          singleRender: false,
        };
      }
      if (leaf.parent) {
        this.getRenderUnitInfo(leaf.parent);
      }
    }

    componentWillReceiveProps(nextProps: any) {
      let { componentId } = nextProps;
      if (nextProps.__tag === this.props.__tag) {
        return null;
      }

      const _leaf = getNode?.(componentId);
      if (_leaf && this.curEventLeaf && _leaf !== this.curEventLeaf) {
        this.disposeFunctions.forEach((fn) => fn());
        this.disposeFunctions = [];
        this.initOnChildrenChangeEvent(_leaf);
        this.initOnPropsChangeEvent(_leaf);
        this.initOnVisibleChangeEvent(_leaf);
        this.curEventLeaf = _leaf;
      }

      const {
        visible,
        ...resetState
      } = this.getDefaultState(nextProps);
      this.setState(resetState);
    }

    /** 监听参数变化 */
    initOnPropsChangeEvent(leaf = this.leaf): void {
      const handlePropsChange = debounce((propChangeInfo: IPublicTypePropChangeOptions) => {
        const {
          key,
          newValue = null,
        } = propChangeInfo;
        const node = leaf;

        if (key === '___condition___') {
          const { condition = true } = this.leaf?.export(IPublicEnumTransformStage.Render) || {};
          const conditionValue = __parseData?.(condition, scope);
          __debug(`key is ___condition___, change condition value to [${condition}]`);
          // 条件表达式改变
          this.setState({
            condition: conditionValue,
          });
          return;
        }

        // 如果循坏条件变化，从根节点重新渲染
        // 目前多层循坏无法判断需要从哪一层开始渲染，故先粗暴解决
        if (key === '___loop___') {
          __debug('key is ___loop___, render a page!');
          container?.rerender();
          // 由于 scope 变化，需要清空缓存，使用新的 scope
          cache.component.delete(componentCacheId);
          return;
        }
        this.beforeRender(RerenderType.PropsChanged);
        const { state } = this;
        const { nodeCacheProps } = state;
        const nodeProps = getProps(node?.export?.(IPublicEnumTransformStage.Render) as IPublicTypeNodeSchema, scope, Comp, componentInfo);
        if (key && !(key in nodeProps) && (key in this.props)) {
          // 当 key 在 this.props 中时，且不存在在计算值中，需要用 newValue 覆盖掉 this.props 的取值
          nodeCacheProps[key] = newValue;
        }
        __debug(`${leaf?.componentName}[${this.props.componentId}] component trigger onPropsChange!`, nodeProps, nodeCacheProps, key, newValue);
        this.setState('children' in nodeProps ? {
          nodeChildren: nodeProps.children,
          nodeProps,
          childrenInState: true,
          nodeCacheProps,
        } : {
          nodeProps,
          nodeCacheProps,
        });

        this.judgeMiniUnitRender();
      });
      const dispose = leaf?.onPropChange?.((propChangeInfo: IPublicTypePropChangeOptions) => {
        if (!this.autoRepaintNode) {
          return;
        }
        handlePropsChange(propChangeInfo);
      });

      dispose && this.disposeFunctions.push(dispose);
    }

    /**
     * 监听显隐变化
     */
    initOnVisibleChangeEvent(leaf = this.leaf) {
      const dispose = leaf?.onVisibleChange?.((flag: boolean) => {
        if (!this.autoRepaintNode) {
          return;
        }
        if (this.state.visible === flag) {
          return;
        }

        __debug(`${leaf?.componentName}[${this.props.componentId}] component trigger onVisibleChange(${flag}) event`);
        this.beforeRender(RerenderType.VisibleChanged);
        this.setState({
          visible: flag,
        });
        this.judgeMiniUnitRender();
      });

      dispose && this.disposeFunctions.push(dispose);
    }

    /**
     * 监听子元素变化（拖拽，删除...）
     */
    initOnChildrenChangeEvent(leaf = this.leaf) {
      const dispose = leaf?.onChildrenChange?.((param): void => {
        if (!this.autoRepaintNode) {
          return;
        }
        const {
          type,
          node,
        } = param || {};
        this.beforeRender(`${RerenderType.ChildChanged}-${type}`, node);
        // TODO: 缓存同级其他元素的 children。
        // 缓存二级 children Next 查询筛选组件有问题
        // 缓存一级 children Next Tab 组件有问题
        const nextChild = getChildren(leaf?.export?.(IPublicEnumTransformStage.Render) as types.ISchema, scope, Comp);
        __debug(`${schema.componentName}[${this.props.componentId}] component trigger onChildrenChange event`, nextChild);
        this.setState({
          nodeChildren: nextChild,
          childrenInState: true,
        });
        this.judgeMiniUnitRender();
      });
      dispose && this.disposeFunctions.push(dispose);
    }

    componentWillUnmount() {
      this.disposeFunctions.forEach(fn => fn());
    }

    get hasChildren(): boolean {
      if (!this.state.childrenInState) {
        return 'children' in this.props;
      }

      return true;
    }

    get children(): any {
      if (this.state.childrenInState) {
        return this.state.nodeChildren;
      }
      if (this.props.children && !Array.isArray(this.props.children)) {
        return [this.props.children];
      }
      if (this.props.children && this.props.children.length) {
        return this.props.children;
      }
      return this.props.children;
    }

    /**
     * 🔥 获取设计器 Node 对象（核心属性）
     *
     * 获取流程：
     * 1. 优先使用 props._leaf（从外部传入）
     * 2. 如果 _leaf 是 mock 对象，返回 undefined（低代码组件整体更新场景）
     * 3. 否则通过 getNode(componentCacheId) 从设计器获取 Node 对象
     *
     * Node 对象的作用：
     * - 提供 schema 导出：leaf.export(IPublicEnumTransformStage.Render)
     * - 监听属性变化：leaf.onPropChange(handler)
     * - 监听子节点变化：leaf.onChildrenChange(handler)
     * - 监听显隐变化：leaf.onVisibleChange(handler)
     * - 访问组件元信息：leaf.componentName, leaf.id
     *
     * @returns Node 对象或 undefined
     */
    get leaf(): INode | undefined {
      // 场景：低代码组件作为一个整体更新，其内部的组件不需要监听相关事件
      if (this.props._leaf?.isMock) {
        return undefined;
      }

      // 从设计器获取 Node 对象（通过 getNode 方法，由 baseRenderer.props.getNode 提供）
      return getNode?.(componentCacheId);
    }

    /**
     * 🎨 渲染方法
     *
     * 核心流程：
     * 1. 检查可见性和条件：不满足则返回 null
     * 2. 合并 props：
     *    - this.props（包含 _leaf、componentId、__tag 等）
     *    - this.state.nodeCacheProps（缓存的 props）
     *    - this.state.nodeProps（从 schema 解析的 props）
     * 3. 🔥 **关键**：_leaf 属性会通过 ...rest 传递给原组件
     * 4. 渲染原组件（Comp），传递合并后的 props
     *
     * 结果：
     * 原组件接收到的 props 包含 _leaf 属性
     * 业务组件可以通过 props._leaf 访问设计器 Node 对象
     *
     * 示例：
     * <MyComponent _leaf={node} __id="xxx" {...otherProps} />
     */
    render() {
      // 不可见或条件为 false，不渲染
      if (!this.state.visible || !this.state.condition) {
        return null;
      }

      const {
        forwardedRef,  // 转发的 ref
        ...rest        // 🔥 其他所有 props（包括 _leaf、componentId、__tag 等）
      } = this.props;

      // 合并所有 props
      const compProps = {
        ...rest,                               // 🔥 _leaf 在这里传递给原组件
        ...(this.state.nodeCacheProps || {}),  // 缓存的 props
        ...(this.state.nodeProps || {}),       // 从 schema 解析的 props
        children: [],
        __id: this.props.componentId,          // 组件 ID
        ref: forwardedRef,                     // 转发 ref
      };

      // 删除内部属性（不传递给原组件）
      delete compProps.__inner__;

      // 如果有子节点，传递 children
      if (this.hasChildren) {
        return engine.createElement(Comp, compProps, this.children);
      }

      // 没有子节点，直接渲染
      return engine.createElement(Comp, compProps);
    }
  }

  let LeafWrapper = forwardRef((props: any, ref: any) => {
    return createElement(LeafHoc, {
      ...props,
      forwardedRef: ref,
    });
  });

  LeafWrapper = cloneEnumerableProperty(LeafWrapper, Comp);

  LeafWrapper.displayName = (Comp as any).displayName;

  cache.component.set(componentCacheId, {
    LeafWrapper,
    Comp,
  });

  return LeafWrapper;
}