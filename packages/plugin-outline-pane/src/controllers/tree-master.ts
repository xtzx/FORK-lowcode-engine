/**
 * @file TreeMaster 树主控制器
 * @description 大纲树的核心控制器，管理多个文档的树实例和全局事件
 *
 * 核心职责：
 * 1. 管理多文档的树实例（每个文档一个 Tree）
 * 2. 监听设计器事件（拖拽、选中、文档切换）
 * 3. 协调主面板和备份面板（boards）
 * 4. 处理插件上下文切换（Workspace 模式）
 * 5. 提供国际化支持
 *
 * 设计架构：
 * ```
 * TreeMaster (单例)
 * ├── Tree (文档1)
 * │   └── TreeNode[]
 * ├── Tree (文档2)
 * │   └── TreeNode[]
 * └── Tree (文档3)
 *     └── TreeNode[]
 *
 * boards (面板集合)
 * ├── MasterPane (主面板)
 * └── BackupPane (备份面板)
 * ```
 *
 * 多文档支持：
 * - 一个项目可能有多个页面
 * - 每个页面对应一个文档（Document）
 * - 每个文档对应一个树（Tree）
 * - TreeMaster 管理所有树
 *
 * Workspace 模式：
 * - 支持多窗口编辑
 * - 支持视图类型切换（设计视图、代码视图等）
 * - 自动切换插件上下文
 *
 * @example
 * ```typescript
 * // 创建树控制器
 * const treeMaster = new TreeMaster(ctx, { extraTitle: '页面' });
 *
 * // 获取当前文档的树
 * const tree = treeMaster.currentTree;
 *
 * // 获取树节点
 * const treeNode = tree.getTreeNode(designerNode);
 *
 * // 展开节点
 * treeNode.expand();
 * ```
 */

import { isLocationChildrenDetail } from '@alilc/lowcode-utils';
import {
  IPublicModelPluginContext,  // 插件上下文接口
  IPublicTypeActiveTarget,  // 激活目标类型
  IPublicModelNode,  // 设计器节点模型
  IPublicTypeDisposable,  // 可清理对象类型
  IPublicEnumPluginRegisterLevel  // 插件注册级别枚举
} from '@alilc/lowcode-types';
import TreeNode from './tree-node';  // 树节点模型
import { Tree } from './tree';  // 树模型
import EventEmitter from 'events';  // 事件触发器
import { enUS, zhCN } from '../locale';  // 国际化资源
import { ReactNode } from 'react';

// ==================== ITreeBoard 接口 ====================
/**
 * 树面板接口
 *
 * 用途：
 * - 定义面板必须实现的方法
 * - TreeMaster 通过此接口协调多个面板
 *
 * 实现者：
 * - PaneController（面板控制器）
 *
 * 方法：
 * - scrollToNode: 滚动到指定节点
 */
export interface ITreeBoard {
  /**
   * 面板标识
   *
   * 用途：
   * - 区分不同的面板
   * - 主面板和备份面板有不同的标识
   */
  readonly at: string | symbol;

  /**
   * 滚动到指定节点
   *
   * @param treeNode - 目标树节点
   * @param detail - 详情信息（可选）
   *
   * 使用场景：
   * - 用户在画布选中节点
   * - 大纲树自动滚动到该节点
   * - 确保节点在视口中可见
   */
  scrollToNode(treeNode: TreeNode, detail?: any): void;
}

// ==================== 事件名称枚举 ====================
/**
 * TreeMaster 事件名称
 *
 * pluginContextChanged: 插件上下文变化
 * - 文档切换
 * - 窗口切换（Workspace 模式）
 * - 视图类型切换
 */
enum EVENT_NAMES {
  pluginContextChanged = 'pluginContextChanged',
}

// ==================== 扩展的插件上下文接口 ====================
/**
 * 大纲树插件上下文接口
 *
 * 继承：IPublicModelPluginContext
 *
 * 扩展字段：
 * - extraTitle: 额外标题配置
 * - intlNode: 国际化方法（返回 ReactNode）
 * - intl: 国际化方法（返回字符串）
 * - getLocale: 获取当前语言
 *
 * 为什么要扩展？
 * - 添加大纲树特有的功能
 * - 提供国际化便捷方法
 * - 类型安全
 */
export interface IOutlinePanelPluginContext extends IPublicModelPluginContext {
  extraTitle?: string;  // 额外标题（如"当前页面"）
  intlNode(id: string, params?: object): ReactNode;  // 国际化（返回元素）
  intl(id: string, params?: object): string;  // 国际化（返回字符串）
  getLocale(): string;  // 获取当前语言（'zh-CN' | 'en-US'）
}

// ==================== TreeMaster 类 ====================
/**
 * 树主控制器类
 *
 * 职责：
 * - 管理所有文档的树实例
 * - 协调主面板和备份面板
 * - 监听全局事件
 * - 处理上下文切换
 *
 * 生命周期：
 * - 插件初始化时创建
 * - 贯穿整个编辑器会话
 * - 插件卸载时销毁
 */
export class TreeMaster {
  // ========== 公开属性 ==========

  /**
   * 插件上下文
   *
   * 类型：IOutlinePanelPluginContext（扩展的上下文）
   *
   * 用途：
   * - 访问编辑器 API
   * - 调用国际化方法
   * - 获取配置和事件
   */
  pluginContext: IOutlinePanelPluginContext;

  // ========== 私有属性：面板集合 ==========
  /**
   * 面板集合
   *
   * 类型：Set<ITreeBoard>
   *
   * 说明：
   * - 存储所有注册的面板（主面板、备份面板）
   * - 使用 Set 自动去重
   * - 面板需要实现 ITreeBoard 接口
   *
   * 用途：
   * - 协调多个面板
   * - 同步滚动位置
   * - 广播事件到所有面板
   *
   * 示例：
   * ```typescript
   * boards = Set {
   *   masterPaneController,  // 主面板
   *   backupPaneController   // 备份面板
   * }
   * ```
   */
  private boards = new Set<ITreeBoard>();

  // ========== 私有属性：树映射表 ==========
  /**
   * 文档ID到树的映射
   *
   * 类型：Map<string, Tree>
   *
   * 结构：{ 文档ID: Tree实例 }
   *
   * 用途：
   * - 每个文档对应一个树
   * - 快速获取文档的树（O(1)）
   * - 文档切换时复用树实例
   *
   * 多文档场景：
   * ```typescript
   * treeMap = {
   *   'doc-home': Tree(首页),
   *   'doc-detail': Tree(详情页),
   *   'doc-list': Tree(列表页)
   * }
   * ```
   *
   * 为什么需要缓存？
   * - 避免重复创建树
   * - 保持树的状态（展开/折叠）
   * - 文档切换时快速恢复
   */
  private treeMap = new Map<string, Tree>();

  // ========== 私有属性：事件清理函数 ==========
  /**
   * 事件清理函数数组
   *
   * 用途：
   * - 存储所有事件监听的清理函数
   * - 上下文切换时清理旧事件
   * - 避免内存泄漏
   *
   * 为什么需要清理？
   * - 文档切换时，旧文档的事件不再需要
   * - 避免回调引用旧的上下文
   * - 防止重复监听
   */
  private disposeEvents: (IPublicTypeDisposable | undefined)[] = [];

  /**
   * 事件触发器
   *
   * 用途：
   * - 发送 TreeMaster 级别的事件
   * - 主要用于上下文变化通知
   */
  event = new EventEmitter();

  // ========== 构造函数 ==========
  /**
   * 构造 TreeMaster 实例
   *
   * @param pluginContext - 插件上下文
   * @param options - 配置选项
   * @param options.extraTitle - 额外标题
   *
   * 初始化流程：
   * 1. 设置插件上下文（初始化国际化）
   * 2. 初始化事件监听
   * 3. 如果是 Workspace 模式，设置窗口切换监听
   *
   * Workspace 模式说明：
   * - 插件可以注册在不同级别
   * - Workspace 级别：跨窗口共享
   * - Editor 级别：每个编辑器独立
   * - 需要监听窗口和视图切换
   */
  constructor(pluginContext: IPublicModelPluginContext, readonly options: {
    extraTitle?: string;  // 额外标题配置
  }) {
    // ===== 第1步：设置插件上下文 =====
    // 初始化国际化方法
    this.setPluginContext(pluginContext);

    // ===== 第2步：获取 workspace 引用 =====
    const { workspace } = this.pluginContext;

    // ===== 第3步：初始化事件监听 =====
    // 监听拖拽、选中、文档切换等事件
    this.initEvent();

    // ===== 第4步：处理 Workspace 模式 =====
    // 如果插件注册在 Workspace 级别
    if (pluginContext.registerLevel === IPublicEnumPluginRegisterLevel.Workspace) {
      // --- 切换到当前窗口的编辑器视图 ---
      this.setPluginContext(workspace.window?.currentEditorView);

      // --- 监听视图类型切换 ---
      /**
       * 视图类型切换监听
       *
       * 视图类型：
       * - 设计视图：可视化编辑
       * - 代码视图：源码编辑
       * - 预览视图：预览效果
       *
       * 切换时需要更新上下文
       */
      let dispose: IPublicTypeDisposable | undefined;
      const windowViewTypeChangeEvent = () => {
        dispose = workspace.window?.onChangeViewType(() => {
          // 视图类型切换，更新上下文
          this.setPluginContext(workspace.window?.currentEditorView);
        });
      };

      // 初始化视图类型监听
      windowViewTypeChangeEvent();

      // --- 监听窗口切换 ---
      /**
       * 窗口切换监听
       *
       * 场景：
       * - 用户在多个编辑器窗口之间切换
       * - 每个窗口可能编辑不同的项目
       * - 需要切换到对应的上下文
       */
      workspace.onChangeActiveWindow(() => {
        // 窗口切换，更新上下文
        this.setPluginContext(workspace.window?.currentEditorView);

        // 清理旧窗口的视图类型监听
        dispose && dispose();

        // 重新监听新窗口的视图类型切换
        windowViewTypeChangeEvent();
      });
    }
  }

  // ========== 私有方法：设置插件上下文 ==========
  /**
   * 设置插件上下文
   *
   * @param pluginContext - 新的插件上下文
   *
   * 功能：
   * 1. 创建国际化方法（intl、intlNode、getLocale）
   * 2. 扩展上下文对象
   * 3. 清理旧事件
   * 4. 初始化新事件
   * 5. 通知上下文变化
   *
   * 调用时机：
   * - 构造函数初始化
   * - 文档切换
   * - 窗口切换（Workspace 模式）
   * - 视图类型切换
   *
   * 为什么要清理旧事件？
   * - 旧上下文的事件不再需要
   * - 避免回调引用旧的上下文
   * - 防止内存泄漏
   */
  private setPluginContext(pluginContext: IPublicModelPluginContext | undefined | null) {
    // 空值检查
    if (!pluginContext) {
      return;
    }

    // ===== 第1步：创建国际化方法 =====
    // 使用编辑器提供的 createIntl 工具
    // 传入本地化资源（enUS、zhCN）
    const { intl, intlNode, getLocale } = pluginContext.common.utils.createIntl({
      'en-US': enUS,
      'zh-CN': zhCN,
    });

    // ===== 第2步：扩展上下文对象 =====
    // 将国际化方法添加到上下文
    let _pluginContext: IOutlinePanelPluginContext = Object.assign(pluginContext, {
      intl,  // 国际化方法（返回字符串）
      intlNode,  // 国际化方法（返回 ReactNode）
      getLocale,  // 获取当前语言
    });

    // 添加额外标题配置
    _pluginContext.extraTitle = this.options && this.options['extraTitle'];

    // 保存扩展后的上下文
    this.pluginContext = _pluginContext;

    // ===== 第3步：清理旧事件 =====
    // 移除旧上下文的事件监听
    this.disposeEvent();

    // ===== 第4步：初始化新事件 =====
    // 为新上下文添加事件监听
    this.initEvent();

    // ===== 第5步：通知上下文变化 =====
    // 发送事件，通知面板更新
    this.emitPluginContextChange();
  }

  // ========== 私有方法：清理事件 ==========
  /**
   * 清理所有事件监听
   *
   * 功能：
   * - 遍历所有清理函数
   * - 逐个调用清理
   * - 释放事件监听资源
   *
   * 调用时机：
   * - 上下文切换前
   * - 确保旧事件被清理
   */
  private disposeEvent() {
    this.disposeEvents.forEach(d => {
      d && d();  // 调用清理函数
    });
  }

  // ========== 私有方法：初始化事件监听 ==========
  /**
   * 初始化所有事件监听
   *
   * 功能：
   * - 监听拖拽开始/结束
   * - 监听激活目标变化（鼠标悬停）
   * - 监听文档移除
   *
   * 事件列表：
   * 1. onDragstart: 拖拽开始
   * 2. onChange(activeTracker): 激活目标变化
   * 3. onDragend: 拖拽结束
   * 4. onRemoveDocument: 文档移除
   *
   * 所有事件的清理函数都存入 disposeEvents 数组
   */
  private initEvent() {
    // 拖拽开始时间（用于计算拖拽耗时）
    let startTime: any;

    // 解构上下文的 API
    const { event, project, canvas } = this.pluginContext;

    // ===== 激活目标变化处理函数 =====
    /**
     * 处理激活目标变化
     *
     * @param target - 激活目标对象
     *
     * 激活目标：
     * - 鼠标悬停的节点
     * - 拖拽悬停的节点
     *
     * 功能：
     * 1. 获取对应的树节点
     * 2. 根据 detail 类型决定展开策略
     * 3. 通知所有面板滚动到该节点
     *
     * 展开策略：
     * - detail 是 Children 类型：展开节点（可能要拖入内部）
     * - 其他：只展开父节点（定位节点位置）
     */
    const setExpandByActiveTracker = (target: IPublicTypeActiveTarget) => {
      const { node, detail } = target;
      const tree = this.currentTree;

      // 无树或节点不属于当前树
      if (!tree/* || node.document !== tree.document */) {
        return;
      }

      // 获取对应的树节点
      const treeNode = tree.getTreeNode(node);

      // 根据 detail 类型决定展开策略
      if (detail && isLocationChildrenDetail(detail)) {
        // Children 类型：展开节点本身（可能要拖入内部）
        treeNode.expand(true);
      } else {
        // 其他：只展开父节点（显示节点位置）
        treeNode.expandParents();
      }

      // 通知所有面板滚动到该节点
      this.boards.forEach((board) => {
        board.scrollToNode(treeNode, detail);
      });
    };

    // ===== 注册所有事件监听 =====
    this.disposeEvents = [
      // 事件1：拖拽开始
      canvas.dragon?.onDragstart(() => {
        // 记录开始时间（秒）
        startTime = Date.now() / 1000;

        // 折叠选中的节点（needs? 可能不需要）
        // 作用：拖拽时折叠被拖拽的节点，减少视觉干扰
        this.toVision();
      }),

      // 事件2：激活目标变化
      // 鼠标悬停在不同节点时触发
      canvas.activeTracker?.onChange(setExpandByActiveTracker),

      // 事件3：拖拽结束
      canvas.dragon?.onDragend(() => {
        // 计算拖拽耗时
        const endTime: any = Date.now() / 1000;

        // 获取当前选中的节点
        const nodes = project.currentDocument?.selection?.getNodes();

        // 发送拖拽结束事件（用于数据统计）
        event.emit('outlinePane.dragend', {
          // 选中节点的组件信息
          selected: nodes
            ?.map((n) => {
              if (!n) {
                return;
              }
              // 提取 npm 包信息
              const npm = n?.componentMeta?.npm;
              // 格式：package-componentName 或 componentName
              return (
                [npm?.package, npm?.componentName].filter((item) => !!item).join('-') ||
                n?.componentMeta?.componentName
              );
            })
            .join('&'),  // 多个节点用 & 连接
          time: (endTime - startTime).toFixed(2),  // 拖拽耗时（秒）
        });
      }),

      // 事件4：文档移除
      // 用户删除页面时触发
      project.onRemoveDocument((data: {id: string}) => {
        const { id } = data;
        // 从树映射表中删除对应的树
        this.treeMap.delete(id);
      }),
    ];

    // ===== 初始化时处理当前激活目标 =====
    // 如果已经有激活的目标，立即处理
    if (canvas.activeTracker?.target) {
      setExpandByActiveTracker(canvas.activeTracker?.target);
    }
  }

  // ========== 私有方法：折叠选中节点 ==========
  /**
   * 折叠所有选中的顶层节点
   *
   * 功能：
   * - 获取选中的顶层节点（不包括子节点）
   * - 折叠这些节点
   *
   * 调用时机：
   * - 拖拽开始时
   *
   * 作用（可能）：
   * - 拖拽时折叠被拖拽节点
   * - 减少视觉干扰
   * - 让目标位置更清晰
   *
   * 注释标注 "needs?"：
   * - 作者也不确定是否必要
   * - 可能是实验性功能
   * - 可以考虑移除
   */
  private toVision() {
    const tree = this.currentTree;
    if (tree) {
      const selection = this.pluginContext.project.getCurrentDocument()?.selection;
      // getTopNodes: 获取选中的顶层节点（不包括其子节点）
      selection?.getTopNodes().forEach((node: IPublicModelNode) => {
        tree.getTreeNode(node).setExpanded(false);
      });
    }
  }

  // ========== 公开方法：添加面板 ==========
  /**
   * 添加面板到 boards 集合
   *
   * @param board - 面板对象（实现 ITreeBoard 接口）
   *
   * 功能：
   * - 注册面板到 TreeMaster
   * - 面板可以接收事件通知
   *
   * 使用场景：
   * ```typescript
   * // PaneController 在初始化时调用
   * treeMaster.addBoard(this);
   * ```
   */
  addBoard(board: ITreeBoard) {
    this.boards.add(board);
  }

  // ========== 公开方法：移除面板 ==========
  /**
   * 从 boards 集合移除面板
   *
   * @param board - 面板对象
   *
   * 功能：
   * - 取消面板的注册
   * - 面板不再接收事件通知
   *
   * 使用场景：
   * ```typescript
   * // PaneController 销毁时调用
   * treeMaster.removeBoard(this);
   * ```
   */
  removeBoard(board: ITreeBoard) {
    this.boards.delete(board);
  }

  // ========== 公开方法：清理 ==========
  /**
   * 清理 TreeMaster 资源
   *
   * 功能：
   * - 清理所有树实例
   * - 清理事件监听
   * - 释放资源
   *
   * TODO: 实现其他清理逻辑
   * - 当前为空实现
   * - 需要补充完整的清理代码
   */
  purge() {
    // todo others purge
  }

  // ========== 公开方法：监听上下文变化 ==========
  /**
   * 监听插件上下文变化事件
   *
   * @param fn - 回调函数
   *
   * 触发时机：
   * - 文档切换
   * - 窗口切换（Workspace 模式）
   * - 视图类型切换
   *
   * 使用场景：
   * ```typescript
   * // 在 OutlinePaneContext 组件中
   * useEffect(() => {
   *   return treeMaster.onPluginContextChange(() => {
   *     // 重新创建 PaneController
   *     setController(new PaneController(...));
   *   });
   * }, []);
   * ```
   */
  onPluginContextChange(fn: () => void) {
    this.event.on(EVENT_NAMES.pluginContextChanged, fn);
  }

  // ========== 公开方法：发送上下文变化事件 ==========
  /**
   * 发送插件上下文变化事件
   *
   * 功能：
   * - 通知所有监听者上下文已变化
   * - 触发面板重新初始化
   *
   * 调用时机：
   * - setPluginContext 方法的最后一步
   */
  emitPluginContextChange() {
    this.event.emit(EVENT_NAMES.pluginContextChanged);
  }

  // ========== 计算属性：获取当前树 ==========
  /**
   * 获取当前文档的树实例
   *
   * @returns Tree 实例或 null
   *
   * 功能：
   * - 获取当前文档
   * - 从 treeMap 查找对应的树
   * - 如果不存在，创建新的树
   * - 缓存到 treeMap
   *
   * 懒加载机制：
   * - 只在需要时创建树
   * - 首次访问时创建
   * - 后续访问直接获取缓存
   *
   * 为什么需要懒加载？
   * - 初始化时可能没有文档
   * - 用户可能创建多个文档
   * - 按需创建，节省资源
   *
   * 使用场景：
   * ```typescript
   * // 获取当前文档的树
   * const tree = treeMaster.currentTree;
   *
   * // 获取树节点
   * const treeNode = tree?.getTreeNode(designerNode);
   * ```
   */
  get currentTree(): Tree | null {
    // 获取当前文档
    const doc = this.pluginContext.project.getCurrentDocument();
    if (doc) {
      const { id } = doc;

      // 从缓存中查找
      if (this.treeMap.has(id)) {
        return this.treeMap.get(id)!;
      }

      // 缓存中没有，创建新树
      const tree = new Tree(this);
      this.treeMap.set(id, tree);
      return tree;
    }

    // 无文档，返回 null
    return null;
  }
}
