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

/** 部分没有渲染的 node 节点进行兜底处理 or 渲染方式没有渲染 LeafWrapper */
function initRerenderEvent({
  schema,
  __debug,
  container,
  getNode,
}: any) {
  const leaf = getNode?.(schema.id);
  if (!leaf
    || cache.event.get(schema.id)?.clear
    || leaf === cache.event.get(schema.id)
  ) {
    return;
  }
  cache.event.get(schema.id)?.dispose.forEach((disposeFn: any) => disposeFn && disposeFn());
  const debounceRerender = debounce(() => {
    container.rerender();
  }, 20);
  cache.event.set(schema.id, {
    clear: false,
    leaf,
    dispose: [
      leaf?.onPropChange?.(() => {
        if (!container.autoRepaintNode) {
          return;
        }
        __debug(`${schema.componentName}[${schema.id}] leaf not render in SimulatorRendererView, leaf onPropsChange make rerender`);
        debounceRerender();
      }),
      leaf?.onChildrenChange?.(() => {
        if (!container.autoRepaintNode) {
          return;
        }
        __debug(`${schema.componentName}[${schema.id}] leaf not render in SimulatorRendererView, leaf onChildrenChange make rerender`);
        debounceRerender();
      }) as Function,
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

/** 渲染的 node 节点全局注册事件清除 */
function clearRerenderEvent(id: string): void {
  if (cache.event.get(id)?.clear) {
    return;
  }
  cache.event.get(id)?.dispose?.forEach((disposeFn: any) => disposeFn && disposeFn());
  cache.event.set(id, {
    clear: true,
    dispose: [],
  });
}

// 给每个组件包裹一个 HOC Leaf，支持组件内部属性变化，自响应渲染
export function leafWrapper(Comp: types.IBaseRenderComponent, {
  schema,
  baseRenderer,
  componentInfo,
  scope,
}: IComponentHocInfo) {
  const {
    __debug,
    __getComponentProps: getProps,
    __getSchemaChildrenVirtualDom: getChildren,
    __parseData,
  } = baseRenderer;
  const { engine } = baseRenderer.context;
  const host = baseRenderer.props?.__host;
  const curDocumentId = baseRenderer.props?.documentId ?? '';
  const curDevice = baseRenderer.props?.device ?? '';
  const getNode = baseRenderer.props?.getNode;
  const container = baseRenderer.props?.__container;
  const setSchemaChangedSymbol = baseRenderer.props?.setSchemaChangedSymbol;
  const editor = host?.designer?.editor;
  const runtime = adapter.getRuntime();
  const { forwardRef, createElement } = runtime;
  const Component = runtime.Component as types.IGeneralConstructor<
    IComponentHocProps, IComponentHocState
  >;

  const componentCacheId = schema.id;

  if (!cache || (curDocumentId && curDocumentId !== cache.documentId) || (curDevice && curDevice !== cache.device)) {
    cache?.event.forEach(event => {
      event.dispose?.forEach((disposeFn: any) => disposeFn && disposeFn());
    });
    cache = new LeafCache(curDocumentId, curDevice);
  }

  if (!isReactComponent(Comp)) {
    logger.error(`${schema.componentName} component may be has errors: `, Comp);
  }

  initRerenderEvent({
    schema,
    __debug,
    container,
    getNode,
  });

  if (curDocumentId && cache.component.has(componentCacheId) && (cache.component.get(componentCacheId).Comp === Comp)) {
    return cache.component.get(componentCacheId).LeafWrapper;
  }

  class LeafHoc extends Component {
    recordInfo: {
      startTime?: number | null;
      type?: string;
      node?: INode;
    } = {};

    private curEventLeaf: INode | undefined;

    static displayName = schema.componentName;

    disposeFunctions: Array<((() => void) | Function)> = [];

    __component_tag = 'leafWrapper';

    renderUnitInfo: {
      minimalUnitId?: string;
      minimalUnitName?: string;
      singleRender?: boolean;
    };

    // 最小渲染单元做防抖处理
    makeUnitRenderDebounced = debounce(() => {
      this.beforeRender(RerenderType.MinimalRenderUnit);
      const schema = this.leaf?.export?.(IPublicEnumTransformStage.Render);
      if (!schema) {
        return;
      }
      const nextProps = getProps(schema, scope, Comp, componentInfo);
      const children = getChildren(schema, scope, Comp);
      const nextState = {
        nodeProps: nextProps,
        nodeChildren: children,
        childrenInState: true,
      };
      if ('children' in nextProps) {
        nextState.nodeChildren = nextProps.children;
      }

      __debug(`${this.leaf?.componentName}(${this.props.componentId}) MinimalRenderUnit Render!`);
      this.setState(nextState);
    }, 20);

    constructor(props: IProps, context: any) {
      super(props, context);
      // 监听以下事件，当变化时更新自己
      __debug(`${schema.componentName}[${this.props.componentId}] leaf render in SimulatorRendererView`);
      clearRerenderEvent(componentCacheId);
      this.curEventLeaf = this.leaf;

      cache.ref.set(componentCacheId, {
        makeUnitRender: this.makeUnitRender,
      });

      let cacheState = cache.state.get(componentCacheId);
      if (!cacheState || cacheState.__tag !== props.__tag) {
        cacheState = this.getDefaultState(props);
      }

      this.state = cacheState;
    }

    recordTime = () => {
      if (!this.recordInfo.startTime) {
        return;
      }
      const endTime = Date.now();
      const nodeCount = host?.designer?.currentDocument?.getNodeCount?.();
      const componentName = this.recordInfo.node?.componentName || this.leaf?.componentName || 'UnknownComponent';
      editor?.eventBus.emit(GlobalEvent.Node.Rerender, {
        componentName,
        time: endTime - this.recordInfo.startTime,
        type: this.recordInfo.type,
        nodeCount,
      });
      this.recordInfo.startTime = null;
    };

    makeUnitRender = () => {
      this.makeUnitRenderDebounced();
    };

    get autoRepaintNode() {
      return container?.autoRepaintNode;
    }

    componentDidUpdate() {
      this.recordTime();
    }

    componentDidMount() {
      const _leaf = this.leaf;
      this.initOnPropsChangeEvent(_leaf);
      this.initOnChildrenChangeEvent(_leaf);
      this.initOnVisibleChangeEvent(_leaf);
      this.recordTime();
    }

    getDefaultState(nextProps: any) {
      const {
        hidden = false,
        condition = true,
      } = nextProps.__inner__ || this.leaf?.export?.(IPublicEnumTransformStage.Render) || {};
      return {
        nodeChildren: null,
        childrenInState: false,
        visible: !hidden,
        condition: __parseData?.(condition, scope),
        nodeCacheProps: {},
        nodeProps: {},
      };
    }

    setState(state: any) {
      cache.state.set(componentCacheId, {
        ...this.state,
        ...state,
        __tag: this.props.__tag,
      });
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