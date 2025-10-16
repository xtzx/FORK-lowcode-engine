/**
 * @file ComponentMeta 组件元数据类
 * @description 管理组件的元信息（属性配置、事件配置、嵌套规则等）
 *
 * 核心职责：
 * 1. 存储组件的元数据（metadata）
 * 2. 提供元数据的访问和修改
 * 3. 处理组件的嵌套规则（nestingRule）
 * 4. 管理组件的高级配置（advanced）
 * 5. 发送元数据变化事件
 *
 * 组件元数据包含：
 * - componentName: 组件名称
 * - npm: npm 包信息
 * - title: 组件标题
 * - icon: 组件图标
 * - configure: 属性配置
 * - nestingRule: 嵌套规则
 * - advanced: 高级配置
 * - prototype: 原型定义
 *
 * 嵌套规则示例：
 * ```typescript
 * // Button 不能嵌套在另一个 Button 内
 * ancestorBlacklist: ['Button']
 *
 * // ListItem 只能作为 List 的直接子元素
 * parentWhitelist: ['List']
 *
 * // List 的子元素只能是 ListItem
 * childWhitelist: ['ListItem']
 * ```
 *
 * 使用场景：
 * - 设计器需要知道组件的配置
 * - 属性面板根据 metadata 渲染设置项
 * - 拖拽时检查嵌套规则
 * - 代码生成时使用组件信息
 *
 * @example
 * ```typescript
 * // 创建组件元数据
 * const buttonMeta = new ComponentMeta(designer, {
 *   componentName: 'Button',
 *   npm: { package: 'antd', version: '4.x' },
 *   title: '按钮',
 *   configure: {
 *     props: [
 *       { name: 'type', setter: 'SelectSetter' }
 *     ]
 *   }
 * });
 *
 * // 使用
 * const canNest = buttonMeta.checkNestingDown(containerNode, buttonNode);
 * ```
 */

import { ReactElement } from 'react';
import {
  IPublicTypeComponentMetadata,  // 组件元数据类型
  IPublicTypeNpmInfo,  // npm 包信息
  IPublicTypeNodeData,  // 节点数据
  IPublicTypeNodeSchema,  // 节点 Schema
  IPublicTypeTitleContent,  // 标题内容
  IPublicTypeTransformedComponentMetadata,  // 转换后的元数据
  IPublicTypeNestingFilter,  // 嵌套过滤器
  IPublicTypeI18nData,  // 国际化数据
  IPublicTypeFieldConfig,  // 字段配置
  IPublicModelComponentMeta,  // 组件元数据模型接口
  IPublicTypeAdvanced,  // 高级配置
  IPublicTypeDisposable,  // 可清理对象
  IPublicTypeLiveTextEditingConfig,  // 实时文本编辑配置
} from '@alilc/lowcode-types';
import { deprecate, isRegExp, isTitleConfig, isNode } from '@alilc/lowcode-utils';
import { computed, createModuleEventBus, IEventBus } from '@alilc/lowcode-editor-core';
import { Node, INode } from './document';
import { Designer } from './designer';
import {
  IconContainer,  // 容器图标
  IconPage,  // 页面图标
  IconComponent,  // 组件图标
} from './icons';

// ==================== 辅助函数：确保返回数组 ====================
/**
 * 确保输入转换为字符串数组
 *
 * @param list - 输入（可能是字符串、数组或空）
 * @returns 字符串数组或 null
 *
 * 功能：
 * - 字符串：分割成数组
 * - 数组：直接返回
 * - 空值：返回 null
 *
 * 分割规则：
 * - 支持多种分隔符：空格、逗号、竖线
 * - 自动去除空字符串
 * - 支持分隔符前后的空格
 *
 * 正则说明：/ *[ ,|] * /
 * - * : 匹配0个或多个空格
 * - [ ,|]: 匹配空格、逗号或竖线
 *
 * @example
 * ```typescript
 * ensureAList('Button Input Select');
 * // ['Button', 'Input', 'Select']
 *
 * ensureAList('Button, Input, Select');
 * // ['Button', 'Input', 'Select']
 *
 * ensureAList('Button | Input | Select');
 * // ['Button', 'Input', 'Select']
 *
 * ensureAList('Button,  Input  |  Select');
 * // ['Button', 'Input', 'Select']  // 自动处理空格
 *
 * ensureAList(['Button', 'Input']);
 * // ['Button', 'Input']  // 数组直接返回
 *
 * ensureAList('');
 * // null  // 空字符串返回 null
 * ```
 */
export function ensureAList(list?: string | string[]): string[] | null {
  // 空值检查
  if (!list) {
    return null;
  }

  // 如果不是数组，尝试转换
  if (!Array.isArray(list)) {
    // 必须是字符串
    if (typeof list !== 'string') {
      return null;
    }
    // 分割字符串：
    // - 按空格、逗号、竖线分割
    // - filter(Boolean) 去除空字符串
    list = list.split(/ *[ ,|] */).filter(Boolean);
  }

  // 空数组返回 null
  if (list.length < 1) {
    return null;
  }

  return list;
}

// ==================== 辅助函数：构建过滤器 ====================
/**
 * 根据规则构建嵌套过滤器函数
 *
 * @param rule - 过滤规则（多种格式）
 * @returns 过滤器函数或 null
 *
 * 支持的规则格式：
 * 1. 函数：直接返回
 * 2. 正则表达式：匹配组件名
 * 3. 字符串：转为数组后匹配
 * 4. 数组：匹配组件名
 *
 * 过滤器函数签名：
 * ```typescript
 * (testNode: Node | NodeSchema) => boolean
 * ```
 *
 * 使用场景：
 * - 嵌套规则：ancestorBlacklist、parentWhitelist 等
 * - 检查组件是否可以嵌套
 *
 * @example
 * ```typescript
 * // 示例1：使用字符串
 * const filter = buildFilter('Button Input Select');
 * filter({ componentName: 'Button' });  // true
 * filter({ componentName: 'Div' });  // false
 *
 * // 示例2：使用正则
 * const filter = buildFilter(/^Ant/);
 * filter({ componentName: 'AntButton' });  // true
 * filter({ componentName: 'Button' });  // false
 *
 * // 示例3：使用函数
 * const filter = buildFilter((node) => {
 *   return node.componentName.startsWith('Custom');
 * });
 * filter({ componentName: 'CustomButton' });  // true
 *
 * // 示例4：嵌套规则中使用
 * {
 *   nestingRule: {
 *     ancestorBlacklist: 'Button Form'  // 不能嵌套在 Button 或 Form 内
 *   }
 * }
 * // buildFilter 会将 'Button Form' 转换为过滤函数
 * ```
 */
export function buildFilter(rule?: string | string[] | RegExp | IPublicTypeNestingFilter) {
  // 空规则返回 null
  if (!rule) {
    return null;
  }

  // ===== 情况1：函数 =====
  // 已经是函数，直接返回
  if (typeof rule === 'function') {
    return rule;
  }

  // ===== 情况2：正则表达式 =====
  // 返回一个函数，测试组件名是否匹配正则
  if (isRegExp(rule)) {
    return (testNode: Node | IPublicTypeNodeSchema) => {
      return rule.test(testNode.componentName);
    };
  }

  // ===== 情况3：字符串或数组 =====
  // 转换为数组
  const list = ensureAList(rule);
  if (!list) {
    return null;
  }

  // 返回一个函数，检查组件名是否在列表中
  return (testNode: Node | IPublicTypeNodeSchema) => {
    return list.includes(testNode.componentName);
  };
}

// ==================== IComponentMeta 接口 ====================
/**
 * 组件元数据接口
 *
 * 继承：IPublicModelComponentMeta<INode>
 *
 * 扩展方法：
 * - setMetadata: 设置元数据
 * - onMetadataChange: 监听元数据变化
 *
 * 扩展属性：
 * - prototype: 原型（废弃）
 * - liveTextEditing: 实时文本编辑配置
 * - rootSelector: 根选择器
 */
export interface IComponentMeta extends IPublicModelComponentMeta<INode> {
  prototype?: any;  // 原型（废弃属性）
  liveTextEditing?: IPublicTypeLiveTextEditingConfig[];  // 实时文本编辑
  get rootSelector(): string | undefined;  // 根选择器
  setMetadata(metadata: IPublicTypeComponentMetadata): void;  // 设置元数据
  onMetadataChange(fn: (args: any) => void): IPublicTypeDisposable;  // 监听变化
}

// ==================== ComponentMeta 类 ====================
/**
 * 组件元数据类
 *
 * 职责：
 * - 存储和管理组件的元信息
 * - 提供元数据的访问接口
 * - 处理嵌套规则
 * - 发送元数据变化事件
 *
 * 核心属性：
 * - componentName: 组件名称
 * - npm: npm 包信息
 * - title/icon: 显示信息
 * - isContainer: 是否是容器
 * - isModal: 是否是模态框
 * - configure: 属性配置
 * - nestingRule: 嵌套规则
 */
export class ComponentMeta implements IComponentMeta {
  // ========== 标识属性 ==========
  /**
   * 组件元数据标识
   * 用于类型判断
   */
  readonly isComponentMeta = true;

  // ========== 私有属性：npm 信息 ==========
  /**
   * npm 包信息
   *
   * 包含：
   * - package: 包名
   * - version: 版本
   * - exportName: 导出名称
   * - subName: 子名称
   */
  private _npm?: IPublicTypeNpmInfo;

  /**
   * 事件总线
   *
   * 用途：
   * - 发送元数据变化事件
   * - 组件间通信
   */
  private emitter: IEventBus = createModuleEventBus('ComponentMeta');

  /**
   * 获取 npm 信息
   */
  get npm() {
    return this._npm;
  }

  /**
   * 设置 npm 信息
   */
  set npm(_npm: any) {
    this.setNpm(_npm);
  }

  // ========== 私有属性：组件名称 ==========
  /**
   * 组件名称
   *
   * 示例：'Button', 'Input', 'Select'
   */
  private _componentName?: string;

  /**
   * 获取组件名称
   *
   * ! 断言非空：假设组件名称已初始化
   */
  get componentName(): string {
    return this._componentName!;
  }

  // ========== 私有属性：是否是容器 ==========
  /**
   * 是否是容器组件
   *
   * 容器组件：
   * - 可以包含子组件
   * - 如：Div、Container、Form
   *
   * 非容器组件：
   * - 不能包含子组件
   * - 如：Button、Input、Image
   */
  private _isContainer?: boolean;

  /**
   * 获取是否是容器
   *
   * 规则：
   * - _isContainer 为 true -> 是容器
   * - 或者是根组件（Page）-> 也是容器
   */
  get isContainer(): boolean {
    return this._isContainer! || this.isRootComponent();
  }

  /**
   * 是否是最小渲染单元
   *
   * 最小渲染单元：
   * - 不可拆分的组件
   * - 内部结构不可编辑
   * - 如：第三方复杂组件
   */
  get isMinimalRenderUnit(): boolean {
    return this._isMinimalRenderUnit || false;
  }

  // ========== 私有属性：是否是模态框 ==========
  /**
   * 是否是模态框组件
   *
   * 模态框特点：
   * - 浮层显示
   * - 遮挡其他内容
   * - 如：Dialog、Modal、Drawer
   *
   * 特殊处理：
   * - 设计态可能不渲染（避免遮挡）
   * - 需要特殊的交互方式
   */
  private _isModal?: boolean;

  /**
   * 获取是否是模态框
   */
  get isModal(): boolean {
    return this._isModal!;
  }

  // ========== 私有属性：描述符 ==========
  /**
   * 组件描述符
   *
   * 用途：
   * - 组件的简短描述
   * - 显示在工具提示中
   */
  private _descriptor?: string;

  /**
   * 获取描述符
   */
  get descriptor(): string | undefined {
    return this._descriptor;
  }

  // ========== 私有属性：根选择器 ==========
  /**
   * 根选择器
   *
   * 用途：
   * - 定位组件的根元素
   * - CSS 选择器格式
   */
  private _rootSelector?: string;

  /**
   * 获取根选择器
   */
  get rootSelector(): string | undefined {
    return this._rootSelector;
  }

  // ========== 私有属性：转换后的元数据 ==========
  /**
   * 转换后的元数据
   *
   * 说明：
   * - 经过 transducer 处理后的元数据
   * - 可能与原始元数据不同
   */
  private _transformedMetadata?: IPublicTypeTransformedComponentMetadata;

  /**
   * 获取属性配置
   *
   * 优先级：
   * 1. combined: 合并后的配置（优先）
   * 2. props: 原始属性配置
   * 3. []: 空数组（默认）
   *
   * 为什么有 combined？
   * - 可能合并了多个来源的配置
   * - 插件可能扩展配置
   * - 平台可能定制配置
   */
  get configure(): IPublicTypeFieldConfig[] {
    const config = this._transformedMetadata?.configure;
    return config?.combined || config?.props || [];
  }

  // ========== 私有属性：实时文本编辑 ==========
  /**
   * 实时文本编辑配置
   *
   * 用途：
   * - 支持画布上直接编辑文本
   * - 双击文本直接修改
   * - 如：标题、段落等
   */
  private _liveTextEditing?: IPublicTypeLiveTextEditingConfig[];

  /**
   * 获取实时文本编辑配置
   */
  get liveTextEditing() {
    return this._liveTextEditing;
  }

  // ========== 私有属性：是否顶部固定 ==========
  /**
   * 是否顶部固定
   *
   * 用途：
   * - 组件是否固定在顶部
   * - 如：顶部导航栏
   */
  private _isTopFixed?: boolean;

  /**
   * 获取是否顶部固定
   *
   * !! 的作用：转换为 boolean
   */
  get isTopFixed(): boolean {
    return !!(this._isTopFixed);
  }

  // ========== 私有属性：嵌套规则 ==========
  /**
   * 父节点白名单
   *
   * 用途：
   * - 限制组件只能作为某些组件的子元素
   * - 如：ListItem 只能在 List 内
   */
  private parentWhitelist?: IPublicTypeNestingFilter | null;

  /**
   * 子节点白名单
   *
   * 用途：
   * - 限制组件只能包含某些子组件
   * - 如：List 只能包含 ListItem
   */
  private childWhitelist?: IPublicTypeNestingFilter | null;

  /**
   * 标题配置
   */
  private _title?: IPublicTypeTitleContent;

  /**
   * 是否是最小渲染单元
   */
  private _isMinimalRenderUnit?: boolean;

  /**
   * 获取标题
   *
   * @returns 标题（字符串、国际化对象或 React 元素）
   *
   * 处理逻辑：
   * 1. 如果是 TitleConfig 对象 -> 返回 label
   * 2. 如果有 _title -> 返回 _title
   * 3. 否则 -> 返回组件名称（降级）
   *
   * TitleConfig 结构：
   * ```typescript
   * {
   *   label: '按钮',
   *   icon: <IconButton />,
   *   docUrl: 'https://...'
   * }
   * ```
   */
  get title(): string | IPublicTypeI18nData | ReactElement {
    // 如果是 TitleConfig 格式
    if (isTitleConfig(this._title)) {
      return (this._title?.label as any) || this.componentName;
    }
    // 返回 title 或组件名称（降级）
    return this._title || this.componentName;
  }

  /**
   * 获取组件图标
   *
   * @computed 装饰器：
   * - MobX 计算属性
   * - 依赖变化时自动重新计算
   *
   * 优先级：
   * 1. transformedMetadata.icon: 元数据中的图标
   * 2. 默认图标（根据组件类型）：
   *    - Page 组件 -> IconPage
   *    - 容器组件 -> IconContainer
   *    - 其他组件 -> IconComponent
   *
   * 为什么要默认图标？
   * - 所有组件都应该有图标
   * - 提升用户体验
   * - 视觉识别
   */
  @computed get icon() {
    return (
      this._transformedMetadata?.icon ||
      (this.componentName === 'Page' ? IconPage : this.isContainer ? IconContainer : IconComponent)
    );
  }

  /**
   * 是否可接受（拖入）
   */
  private _acceptable?: boolean;

  /**
   * 获取是否可接受
   */
  get acceptable(): boolean {
    return this._acceptable!;
  }

  /**
   * 获取高级配置
   *
   * 高级配置包含：
   * - callbacks: 生命周期回调
   * - shortcuts: 快捷方式
   * - 其他高级功能
   */
  get advanced(): IPublicTypeAdvanced {
    return this.getMetadata().configure.advanced || {};
  }

  /**
   * 原型（废弃属性）
   *
   * @legacy 兼容旧版本
   * @deprecated 不再使用
   */
  prototype?: any;

  // ========== 构造函数 ==========
  /**
   * 构造组件元数据实例
   *
   * @param designer - 设计器实例
   * @param metadata - 组件元数据
   *
   * 初始化：
   * - 解析元数据
   * - 设置各个属性
   * - 处理嵌套规则
   */
  constructor(readonly designer: Designer, metadata: IPublicTypeComponentMetadata) {
    this.parseMetadata(metadata);
  }

  /**
   * 设置 npm 信息
   *
   * @param info - npm 包信息
   *
   * 规则：
   * - 只能设置一次
   * - 已设置则不再修改
   *
   * 为什么只能设置一次？
   * - npm 信息应该是稳定的
   * - 避免混淆和错误
   */
  setNpm(info: IPublicTypeNpmInfo) {
    if (!this._npm) {
      this._npm = info;
    }
  }

  setNpm(info: IPublicTypeNpmInfo) {
    if (!this._npm) {
      this._npm = info;
    }
  }

  // ========== 私有方法：解析元数据 ==========
  /**
   * 解析组件元数据
   *
   * @param metadata - 原始元数据
   *
   * 功能：
   * 1. 提取 componentName 和 npm
   * 2. 处理未注册组件（禁用操作）
   * 3. 转换元数据
   * 4. 处理标题国际化
   * 5. 收集实时文本编辑配置
   * 6. 解析嵌套规则
   *
   * 未注册组件处理：
   * - 没有 npm 信息且没有其他配置
   * - 可能是临时组件或错误配置
   * - 只允许删除，禁止复制、移动、锁定
   * - 防止操作异常
   */
  private parseMetadata(metadata: IPublicTypeComponentMetadata) {
    // 解构元数据
    const { componentName, npm, ...others } = metadata;
    let _metadata = metadata;

    // 处理原型（废弃功能）
    if ((metadata as any).prototype) {
      this.prototype = (metadata as any).prototype;
    }

    // ===== 处理未注册组件 =====
    // 没有 npm 且没有其他配置 -> 未注册组件
    if (!npm && !Object.keys(others).length) {
      // 构建受限的元数据：
      // - 禁用复制、移动、锁定、解锁
      // - 禁止移动（onMoveHook 返回 false）
      _metadata = {
        componentName,
        configure: {
          component: {
            disableBehaviors: ['copy', 'move', 'lock', 'unlock'],  // 禁用行为
          },
          advanced: {
            callbacks: {
              onMoveHook: () => false,  // 禁止移动
            },
          },
        },
      };
    }

    // 设置 npm 和组件名
    this._npm = npm || this._npm;
    this._componentName = componentName;

    // 额外转换逻辑
    this._transformedMetadata = this.transformMetadata(_metadata);

    const { title } = this._transformedMetadata;
    if (title) {
      this._title =
        typeof title === 'string'
          ? {
              type: 'i18n',
              'en-US': this.componentName,
              'zh-CN': title,
            }
          : title;
    }

    const liveTextEditing = this.advanced.liveTextEditing || [];

    function collectLiveTextEditing(items: IPublicTypeFieldConfig[]) {
      items.forEach((config) => {
        if (config?.items) {
          collectLiveTextEditing(config.items);
        } else {
          const liveConfig = config.liveTextEditing || config.extraProps?.liveTextEditing;
          if (liveConfig) {
            liveTextEditing.push({
              propTarget: String(config.name),
              ...liveConfig,
            });
          }
        }
      });
    }
    collectLiveTextEditing(this.configure);
    this._liveTextEditing = liveTextEditing.length > 0 ? liveTextEditing : undefined;

    const isTopFixed = this.advanced.isTopFixed;

    if (isTopFixed) {
      this._isTopFixed = isTopFixed;
    }

    const { configure = {} } = this._transformedMetadata;
    this._acceptable = false;

    const { component } = configure;
    if (component) {
      this._isContainer = !!component.isContainer;
      this._isModal = !!component.isModal;
      this._descriptor = component.descriptor;
      this._rootSelector = component.rootSelector;
      this._isMinimalRenderUnit = component.isMinimalRenderUnit;
      if (component.nestingRule) {
        const { parentWhitelist, childWhitelist } = component.nestingRule;
        this.parentWhitelist = buildFilter(parentWhitelist);
        this.childWhitelist = buildFilter(childWhitelist);
      }
    } else {
      this._isContainer = false;
      this._isModal = false;
    }
    this.emitter.emit('metadata_change');
  }

  refreshMetadata() {
    this.parseMetadata(this.getMetadata());
  }

  private transformMetadata(
      metadta: IPublicTypeComponentMetadata,
    ): IPublicTypeTransformedComponentMetadata {
    const registeredTransducers = this.designer.componentActions.getRegisteredMetadataTransducers();
    const result = registeredTransducers.reduce((prevMetadata, current) => {
      return current(prevMetadata);
    }, preprocessMetadata(metadta));

    if (!result.configure) {
      result.configure = {};
    }
    if (result.experimental && !result.configure.advanced) {
      deprecate(result.experimental, '.experimental', '.configure.advanced');
      result.configure.advanced = result.experimental;
    }
    return result as any;
  }

  isRootComponent(includeBlock = true): boolean {
    return (
      this.componentName === 'Page' ||
      this.componentName === 'Component' ||
      (includeBlock && this.componentName === 'Block')
    );
  }

  @computed get availableActions() {
    // eslint-disable-next-line prefer-const
    let { disableBehaviors, actions } = this._transformedMetadata?.configure.component || {};
    const disabled =
      ensureAList(disableBehaviors) ||
      (this.isRootComponent(false) ? ['copy', 'remove', 'lock', 'unlock'] : null);
    actions = this.designer.componentActions.actions.concat(
      this.designer.getGlobalComponentActions() || [],
      actions || [],
    );

    if (disabled) {
      if (disabled.includes('*')) {
        return actions.filter((action) => action.condition === 'always');
      }
      return actions.filter((action) => disabled.indexOf(action.name) < 0);
    }
    return actions;
  }

  setMetadata(metadata: IPublicTypeComponentMetadata) {
    this.parseMetadata(metadata);
  }

  getMetadata(): IPublicTypeTransformedComponentMetadata {
    return this._transformedMetadata!;
  }

  // ========== 公开方法：检查向上嵌套 ==========
  /**
   * 检查节点是否可以插入到父节点中
   *
   * @param my - 要插入的节点（当前节点）
   * @param parent - 目标父节点
   * @returns true - 可以插入，false - 不可以插入
   *
   * 功能：
   * - 检查父节点白名单（parentWhitelist）
   * - 如果有白名单，必须匹配才能插入
   * - 如果无白名单，默认可以插入
   *
   * 嵌套规则：
   * ```typescript
   * // ListItem 的元数据：
   * {
   *   nestingRule: {
   *     parentWhitelist: ['List']  // 只能作为 List 的子元素
   *   }
   * }
   *
   * // 检查：
   * listItemMeta.checkNestingUp(listItemNode, listNode);  // true
   * listItemMeta.checkNestingUp(listItemNode, divNode);   // false
   * ```
   *
   * 直接约束型：
   * - 拖拽时直接跳过不匹配的容器
   * - 不会显示插入线
   * - 用户体验更好
   *
   * @example
   * ```typescript
   * // 拖拽 ListItem
   * if (listItemMeta.checkNestingUp(listItemNode, targetNode)) {
   *   // 可以插入，显示插入线
   * } else {
   *   // 不可以插入，跳过这个容器
   * }
   * ```
   */
  checkNestingUp(my: INode | IPublicTypeNodeData, parent: INode) {
    // 如果有父节点白名单，检查是否匹配
    if (this.parentWhitelist) {
      return this.parentWhitelist(
        parent.internalToShellNode(),  // 转为 Shell 节点
        isNode<INode>(my) ? my.internalToShellNode() : my,
      );
    }
    // 无白名单，默认允许
    return true;
  }

  // ========== 公开方法：检查向下嵌套 ==========
  /**
   * 检查目标节点是否可以插入到当前节点中
   *
   * @param my - 当前节点（容器）
   * @param target - 要插入的目标节点（或节点数组）
   * @returns true - 可以插入，false - 不可以插入
   *
   * 功能：
   * - 检查子节点白名单（childWhitelist）
   * - 如果有白名单，目标必须都匹配才能插入
   * - 如果无白名单，默认可以插入
   *
   * 嵌套规则：
   * ```typescript
   * // List 的元数据：
   * {
   *   nestingRule: {
   *     childWhitelist: ['ListItem']  // 只能包含 ListItem
   *   }
   * }
   *
   * // 检查：
   * listMeta.checkNestingDown(listNode, listItemNode);  // true
   * listMeta.checkNestingDown(listNode, buttonNode);    // false
   * ```
   *
   * 支持批量检查：
   * - target 可以是单个节点或节点数组
   * - 使用 every() 确保所有节点都匹配
   * - 一个不匹配就返回 false
   *
   * @example
   * ```typescript
   * // 拖拽多个节点到 List
   * const nodes = [listItem1, listItem2, button];
   * if (listMeta.checkNestingDown(listNode, nodes)) {
   *   // 所有节点都可以插入
   * } else {
   *   // 至少有一个节点不可以插入（button）
   * }
   * ```
   */
  checkNestingDown(my: INode, target: INode | IPublicTypeNodeSchema | IPublicTypeNodeSchema[]): boolean {
    // 如果有子节点白名单，检查是否匹配
    if (this.childWhitelist) {
      // 确保 target 是数组
      const _target: any = !Array.isArray(target) ? [target] : target;

      // 检查每个目标节点是否都匹配白名单
      return _target.every((item: Node | IPublicTypeNodeSchema) => {
        // 如果是 Schema，创建临时 Node 对象
        const _item = !isNode<INode>(item) ? new Node(my.document, item) : item;

        // 调用白名单函数检查
        return (
          this.childWhitelist &&
          this.childWhitelist(_item.internalToShellNode(), my.internalToShellNode())
        );
      });
    }
    // 无白名单，默认允许
    return true;
  }

  // ========== 公开方法：监听元数据变化 ==========
  /**
   * 监听元数据变化事件
   *
   * @param fn - 回调函数
   * @returns 清理函数
   *
   * 功能：
   * - 注册元数据变化监听器
   * - 返回清理函数
   *
   * 使用场景：
   * ```typescript
   * const dispose = componentMeta.onMetadataChange((newMetadata) => {
   *   console.log('元数据变化：', newMetadata);
   *   // 更新 UI
   * });
   *
   * // 组件卸载时清理
   * dispose();
   * ```
   */
  onMetadataChange(fn: (args: any) => void): IPublicTypeDisposable {
    // 监听 metadata_change 事件
    this.emitter.on('metadata_change', fn);

    // 返回清理函数
    return () => {
      this.emitter.removeListener('metadata_change', fn);
    };
  }

}

// ==================== 类型守卫函数 ====================
/**
 * 判断对象是否是 ComponentMeta 实例
 *
 * @param obj - 要判断的对象
 * @returns true - 是 ComponentMeta，false - 不是
 *
 * TypeScript 类型守卫：
 * - obj is ComponentMeta 语法
 * - 判断为 true 后，TypeScript 会自动推断类型
 *
 * @example
 * ```typescript
 * if (isComponentMeta(obj)) {
 *   // TypeScript 知道 obj 是 ComponentMeta
 *   console.log(obj.componentName);  // ✅ 类型安全
 * }
 * ```
 */
export function isComponentMeta(obj: any): obj is ComponentMeta {
  return obj && obj.isComponentMeta;
}

// ==================== 辅助函数：预处理元数据 ====================
/**
 * 预处理组件元数据
 *
 * @param metadata - 原始元数据
 * @returns 转换后的元数据
 *
 * 功能：
 * - 标准化 configure 字段
 * - 兼容数组格式的 configure
 *
 * 格式转换：
 * ```typescript
 * // 输入：数组格式（旧版本）
 * {
 *   componentName: 'Button',
 *   configure: [
 *     { name: 'type', setter: 'SelectSetter' }
 *   ]
 * }
 *
 * // 输出：对象格式（新版本）
 * {
 *   componentName: 'Button',
 *   configure: {
 *     props: [
 *       { name: 'type', setter: 'SelectSetter' }
 *     ]
 *   }
 * }
 * ```
 *
 * 为什么需要预处理？
 * - 兼容旧版本的元数据格式
 * - 统一内部处理逻辑
 * - 简化后续代码
 */
function preprocessMetadata(metadata: IPublicTypeComponentMetadata): IPublicTypeTransformedComponentMetadata {
  // 如果有 configure 字段
  if (metadata.configure) {
    if (Array.isArray(metadata.configure)) {
      // 数组格式 -> 转为对象格式
      return {
        ...metadata,
        configure: {
          props: metadata.configure,  // 数组放到 props 字段
        },
      };
    }
    // 对象格式 -> 直接返回
    return metadata as any;
  }

  // 无 configure -> 添加空对象
  return {
    ...metadata,
    configure: {},
  };
}
