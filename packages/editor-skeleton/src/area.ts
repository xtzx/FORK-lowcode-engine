/**
 * @file Area 区域管理类
 * @description 管理编辑器中的一个布局区域（如左侧区域、右侧区域等）
 *
 * 核心功能：
 * - 管理区域内的 Widget 列表
 * - 控制区域的显示/隐藏
 * - 支持独占模式（exclusive）：同一时间只显示一个 Widget
 * - 提供 Widget 的增删改查
 *
 * 独占模式 vs 普通模式：
 *
 * 普通模式（exclusive=false）：
 * ```
 * ┌────────────────┐
 * │ Widget 1       │
 * │ Widget 2       │
 * │ Widget 3       │
 * └────────────────┘
 * 所有 Widget 同时显示
 * ```
 *
 * 独占模式（exclusive=true）：
 * ```
 * ┌────────────────┐
 * │ Tab1 Tab2 Tab3 │ <- 标签页
 * ├────────────────┤
 * │ Widget 1       │ <- 只显示当前激活的
 * └────────────────┘
 * 同一时间只显示一个 Widget
 * ```
 *
 * 使用场景：
 * - leftArea/rightArea: 独占模式（多个面板通过标签切换）
 * - toolbar: 普通模式（所有按钮同时显示）
 * - topArea: 普通模式（所有内容同时显示）
 *
 * 关键概念：
 * - Area: 区域（容器）
 * - Widget: 区域内的组件
 * - Container: Widget 的容器管理器
 * - current: 当前激活的 Widget（独占模式）
 *
 * @example
 * ```typescript
 * // 创建左侧区域（独占模式）
 * const leftArea = new Area(
 *   skeleton,
 *   'leftArea',
 *   handleWidget,
 *   true  // exclusive = true
 * );
 *
 * // 添加面板
 * leftArea.add({
 *   type: 'Panel',
 *   name: 'outline',
 *   content: <OutlineTree />
 * });
 *
 * leftArea.add({
 *   type: 'Panel',
 *   name: 'components',
 *   content: <ComponentList />
 * });
 *
 * // 结果：显示为标签页，只有一个面板可见
 * ```
 */

/* eslint-disable max-len */
import { obx, computed, makeObservable } from '@alilc/lowcode-editor-core';  // MobX 响应式
import { Logger } from '@alilc/lowcode-utils';  // 日志工具
import { IPublicTypeWidgetBaseConfig } from '@alilc/lowcode-types';  // Widget 配置类型
import { WidgetContainer } from './widget/widget-container';  // Widget 容器
import { ISkeleton } from './skeleton';  // Skeleton 接口
import { IWidget } from './widget/widget';  // Widget 接口

/**
 * Logger 实例
 *
 * 配置：
 * - level: 'warn' - 只记录警告和错误
 * - bizName: 'skeleton:area' - 业务标识，便于日志过滤
 *
 * 用途：
 * - 记录重复添加 Widget 的警告
 * - 记录异常情况
 */
const logger = new Logger({ level: 'warn', bizName: 'skeleton:area' });

// ==================== IArea 接口 ====================
/**
 * Area 接口定义
 *
 * 泛型参数：
 * - C: Config 类型（Widget 配置类型）
 * - T: Widget 类型（Widget 实例类型）
 *
 * 核心方法：
 * - isEmpty: 判断区域是否为空
 * - add: 添加 Widget
 * - remove: 移除 Widget
 * - setVisible: 设置可见性
 * - hide/show: 快捷方法
 */
export interface IArea<C, T> {
  isEmpty(): boolean;
  add(config: T | C): T;
  remove(config: T | string): number;
  setVisible(flag: boolean): void;
  hide(): void;
  show(): void;
}

// ==================== Area 类 ====================
/**
 * Area 区域类
 *
 * 职责：
 * - 管理一个布局区域（如 leftArea、toolbar 等）
 * - 维护区域内的 Widget 列表
 * - 控制区域的显示状态
 * - 处理独占模式的逻辑
 *
 * 泛型参数：
 * - C: Widget 配置类型，默认 any
 * - T: Widget 实例类型，默认 IWidget
 *
 * 响应式设计：
 * - 使用 MobX @obx 和 @computed
 * - 属性变化自动触发视图更新
 */
export class Area<C extends IPublicTypeWidgetBaseConfig = any, T extends IWidget = IWidget> implements IArea<C, T> {
  // ========== 私有属性：可见性标志 ==========
  /**
   * 区域可见性标志（私有）
   *
   * @obx 装饰器：
   * - MobX 可观察属性
   * - 变化时自动触发依赖更新
   *
   * 默认值：true（默认可见）
   *
   * 注意：
   * - 只在非独占模式下使用
   * - 独占模式下由 container.current 控制
   */
  @obx private _visible = true;

  // ========== 计算属性：可见性 ==========
  /**
   * 获取区域可见性
   *
   * @computed 装饰器：
   * - MobX 计算属性
   * - 自动追踪依赖
   * - 结果会被缓存
   *
   * 逻辑：
   * - 独占模式：根据是否有激活的 Widget 判断
   * - 普通模式：直接返回 _visible
   *
   * 为什么独占模式要这样判断？
   * ```typescript
   * // 独占模式下：
   * - 没有激活的 Widget -> 区域不可见（空白）
   * - 有激活的 Widget -> 区域可见（显示内容）
   *
   * // 普通模式下：
   * - 区域可见性独立于 Widget
   * - 可以显示空区域（用于占位）
   * ```
   */
  @computed get visible() {
    if (this.exclusive) {
      // 独占模式：有当前 Widget 才可见
      return this.container.current != null;
    }
    // 普通模式：使用 _visible 标志
    return this._visible;
  }

  // ========== 计算属性：当前 Widget ==========
  /**
   * 获取当前激活的 Widget
   *
   * 返回值：
   * - 独占模式：返回当前激活的 Widget
   * - 普通模式：返回 null（不需要"当前"概念）
   *
   * 使用场景：
   * - 独占模式下判断哪个 Widget 在显示
   * - 渲染标签页时高亮当前标签
   */
  get current() {
    if (this.exclusive) {
      return this.container.current;
    }
    return null;
  }

  // ========== 只读属性：Widget 容器 ==========
  /**
   * Widget 容器实例
   *
   * 职责：
   * - 存储和管理 Widget 列表
   * - 处理 Widget 的激活/取消激活
   * - 提供 Widget 的增删改查
   *
   * 只读：
   * - 容器在构造时创建，不允许替换
   */
  readonly container: WidgetContainer<T, C>;

  // ========== 私有属性：上次的当前 Widget ==========
  /**
   * 记录上次激活的 Widget
   *
   * 用途：
   * - 隐藏区域时记录当前 Widget
   * - 再次显示时恢复到上次的 Widget
   *
   * 场景：
   * ```typescript
   * leftArea.current = 'outline';  // 显示大纲树
   * leftArea.hide();  // 隐藏左侧区域，记录 lastCurrent = 'outline'
   * leftArea.show();  // 再次显示，恢复到大纲树
   * ```
   */
  private lastCurrent: T | null = null;

  // ========== 构造函数 ==========
  /**
   * 构造 Area 实例
   *
   * @param skeleton - Skeleton 实例引用（只读）
   * @param name - 区域名称（只读），如 'leftArea'、'toolbar'
   * @param handle - Widget 处理函数，将配置转换为 Widget 实例
   * @param exclusive - 是否独占模式（可选，默认 false）
   * @param defaultSetCurrent - 是否默认激活第一个 Widget（可选，默认 false）
   *
   * 处理函数（handle）的作用：
   * ```typescript
   * // 示例：
   * function handle(config) {
   *   if (isPanelDockConfig(config)) {
   *     return new PanelDock(config);
   *   }
   *   if (isWidgetConfig(config)) {
   *     return new Widget(config);
   *   }
   *   return config;
   * }
   * ```
   *
   * 初始化流程：
   * 1. 启用 MobX 响应式
   * 2. 创建 WidgetContainer
   * 3. 传递可见性 getter（() => this.visible）
   */
  constructor(readonly skeleton: ISkeleton, readonly name: string, handle: (item: T | C) => T, private exclusive?: boolean, defaultSetCurrent = false) {
    // 启用 MobX 响应式（激活 @obx 和 @computed 装饰器）
    makeObservable(this);

    // 创建 Widget 容器
    // 参数说明：
    // - name: 容器名称
    // - handle: Widget 转换函数
    // - exclusive: 是否独占
    // - () => this.visible: 可见性 getter（传递函数而不是值，实现动态绑定）
    // - defaultSetCurrent: 是否默认激活第一个
    this.container = skeleton.createContainer(name, handle, exclusive, () => this.visible, defaultSetCurrent);
  }

  // ========== 公开方法：判断是否为空 ==========
  /**
   * 判断区域是否为空（没有 Widget）
   *
   * @returns true - 空区域，false - 有 Widget
   *
   * 实现：
   * - 检查 container.items 数组长度
   *
   * 使用场景：
   * - 决定是否显示区域占位符
   * - 优化渲染（空区域不渲染）
   *
   * @example
   * ```typescript
   * if (leftArea.isEmpty()) {
   *   console.log('左侧区域为空');
   * }
   * ```
   */
  isEmpty(): boolean {
    return this.container.items.length < 1;
  }

  // ========== 公开方法：添加 Widget ==========
  /**
   * 添加 Widget 到区域
   *
   * @param config - Widget 配置或实例
   * @returns Widget 实例
   *
   * 流程：
   * 1. 检查是否已存在同名 Widget
   * 2. 如果存在，记录警告并返回已有的
   * 3. 如果不存在，添加到容器
   *
   * 去重逻辑：
   * - 使用 config.name 作为唯一标识
   * - 同一区域不允许重复的 name
   *
   * 为什么要去重？
   * - 避免重复渲染
   * - 避免状态冲突
   * - 防止意外的重复注册
   *
   * @example
   * ```typescript
   * // 添加面板
   * const widget = leftArea.add({
   *   type: 'Panel',
   *   name: 'outline',
   *   content: <OutlineTree />
   * });
   *
   * // 尝试重复添加（会警告）
   * leftArea.add({
   *   type: 'Panel',
   *   name: 'outline',  // 重复的 name
   *   content: <SomethingElse />
   * });
   * // 输出警告："The outline has already been added to skeleton."
   * // 返回已有的 Widget
   * ```
   */
  add(config: T | C): T {
    // 检查是否已存在
    const item = this.container.get(config.name);
    if (item) {
      // 已存在，记录警告
      logger.warn(`The ${config.name} has already been added to skeleton.`);
      return item;
    }
    // 不存在，添加到容器
    // container.add() 会：
    // 1. 调用 handle 函数转换配置
    // 2. 添加到 items 数组
    // 3. 触发 MobX 更新
    return this.container.add(config);
  }

  // ========== 公开方法：移除 Widget ==========
  /**
   * 移除 Widget
   *
   * @param config - Widget 实例或 name
   * @returns 移除的数量（0 或 1）
   *
   * 支持两种方式：
   * - 传递 Widget 实例
   * - 传递 Widget 的 name（字符串）
   *
   * @example
   * ```typescript
   * // 方式1：传递 name
   * leftArea.remove('outline');
   *
   * // 方式2：传递实例
   * const widget = leftArea.container.get('outline');
   * leftArea.remove(widget);
   * ```
   */
  remove(config: T | string): number {
    // 直接委托给 container.remove
    // container.remove 会：
    // 1. 查找匹配的 Widget
    // 2. 从 items 数组移除
    // 3. 调用 Widget 的 dispose 方法（如果有）
    // 4. 触发 MobX 更新
    // 5. 返回移除的数量
    return this.container.remove(config);
  }

  // ========== 公开方法：设置可见性 ==========
  /**
   * 设置区域可见性
   *
   * @param flag - true 显示，false 隐藏
   *
   * 逻辑分支：
   * - 独占模式：激活/取消激活 Widget
   * - 普通模式：直接设置 _visible
   *
   * 独占模式的处理逻辑：
   * ```
   * 显示（flag=true）：
   *   - 如果没有当前 Widget
   *   - 激活上次的 Widget 或第一个 Widget
   *
   * 隐藏（flag=false）：
   *   - 如果有当前 Widget
   *   - 记录到 lastCurrent
   *   - 取消激活
   * ```
   *
   * 为什么独占模式要这样处理？
   * - 显示时需要知道显示哪个 Widget
   * - 隐藏时记录当前状态，方便恢复
   *
   * @example
   * ```typescript
   * // 独占模式示例
   * leftArea.add({ name: 'outline', ... });
   * leftArea.add({ name: 'components', ... });
   *
   * leftArea.container.active('outline');  // 激活大纲树
   * leftArea.hide();  // 隐藏区域，记录 lastCurrent = outline
   * leftArea.show();  // 显示区域，恢复到大纲树
   *
   * // 普通模式示例
   * toolbar.add({ name: 'save', ... });
   * toolbar.hide();  // 直接隐藏整个工具栏
   * toolbar.show();  // 直接显示整个工具栏
   * ```
   */
  setVisible(flag: boolean) {
    // ===== 独占模式的处理 =====
    if (this.exclusive) {
      const { current } = this.container;

      if (flag && !current) {
        // --- 显示且当前没有激活的 Widget ---
        // 激活上次的 Widget，如果没有则激活第一个
        this.container.active(this.lastCurrent || this.container.getAt(0));
      } else if (current) {
        // --- 隐藏且当前有激活的 Widget ---
        // 记录当前 Widget
        this.lastCurrent = current;
        // 取消激活
        this.container.unactive(current);
      }
      return;
    }

    // ===== 普通模式的处理 =====
    // 直接设置可见性标志
    this._visible = flag;
  }

  // ========== 公开方法：隐藏区域 ==========
  /**
   * 隐藏区域（快捷方法）
   *
   * 等价于：setVisible(false)
   *
   * @example
   * ```typescript
   * leftArea.hide();
   * ```
   */
  hide() {
    this.setVisible(false);
  }

  // ========== 公开方法：显示区域 ==========
  /**
   * 显示区域（快捷方法）
   *
   * 等价于：setVisible(true)
   *
   * @example
   * ```typescript
   * leftArea.show();
   * ```
   */
  show() {
    this.setVisible(true);
  }

  // ========== 兼容性方法（已废弃） ==========
  /**
   * 移除 Widget（废弃方法）
   *
   * @deprecated 使用 remove() 替代
   *
   * 为什么废弃？
   * - 命名不规范（removeAction 不如 remove 直观）
   * - 与 add 方法不对称
   *
   * 保留原因：
   * - 向后兼容
   * - 避免破坏已有代码
   */
  removeAction(config: string): number {
    return this.remove(config);
  }
}
