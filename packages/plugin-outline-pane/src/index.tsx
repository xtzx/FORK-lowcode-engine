/**
 * @file 大纲树插件入口文件
 * @description 实现低代码编辑器的大纲树面板插件
 *
 * 插件功能：
 * 1. 显示页面的节点树结构（类似 DOM 树）
 * 2. 支持节点的选中、展开、折叠
 * 3. 支持节点的拖拽排序
 * 4. 支持节点的显示/隐藏、锁定/解锁
 * 5. 支持节点的过滤和搜索
 * 6. 双面板机制：主面板（左侧）+ 备份面板（右侧）
 *
 * 核心概念：
 * - TreeMaster: 树的控制器，管理整个树的状态和逻辑
 * - PaneController: 面板控制器，管理单个面板的状态
 * - TreeNode: 树节点，对应 Schema 中的一个节点
 *
 * 双面板机制：
 * - MasterPane（主面板）：左侧区域，常驻显示
 * - BackupPane（备份面板）：右侧区域，拖拽时自动显示
 *
 * 为什么需要备份面板？
 * - 拖拽时主面板可能被遮挡
 * - 备份面板在右侧显示，方便查看层级
 * - 拖拽结束后自动隐藏
 *
 * 架构设计：
 * ```
 * OutlinePlugin
 * ├── TreeMaster (树控制器)
 * │   ├── TreeNode[] (节点列表)
 * │   └── Tree (树模型)
 * ├── PaneController (面板控制器)
 * └── Pane (面板视图)
 *     ├── Filter (过滤器)
 *     └── TreeBranches (树分支)
 *         └── TreeNode (树节点视图)
 * ```
 */

import { Pane } from './views/pane';  // 面板视图组件
import { IconOutline } from './icons/outline';  // 大纲树图标
import { IPublicModelPluginContext, IPublicModelDocumentModel } from '@alilc/lowcode-types';
import { MasterPaneName, BackupPaneName } from './helper/consts';  // 面板名称常量
import { TreeMaster } from './controllers/tree-master';  // 树控制器
import { PaneController } from './controllers/pane-controller';  // 面板控制器
import { useState, useEffect } from 'react';

// ==================== 大纲树面板上下文组件 ====================
/**
 * OutlinePaneContext - 大纲树面板上下文组件
 *
 * 职责：
 * - 创建和管理 TreeMaster（树控制器）
 * - 创建和管理 PaneController（面板控制器）
 * - 监听插件上下文变化，重新创建控制器
 * - 渲染 Pane 视图组件
 *
 * 为什么需要这个组件？
 * - 封装控制器的创建逻辑
 * - 处理控制器的生命周期
 * - 监听上下文变化（如切换文档）
 * - 提供统一的接口给主面板和备份面板
 *
 * 使用场景：
 * - 主面板（MasterPane）使用
 * - 备份面板（BackupPane）使用
 * - 两个面板共享同一个 TreeMaster
 *
 * @param props - 组件属性
 * @param props.treeMaster - 树控制器（可选，默认创建新的）
 * @param props.pluginContext - 插件上下文（必需）
 * @param props.options - 插件配置（必需）
 * @param props.paneName - 面板名称（必需）
 * @param props.hideFilter - 是否隐藏过滤器（可选）
 *
 * @example
 * ```tsx
 * // 主面板使用
 * <OutlinePaneContext
 *   treeMaster={treeMaster}
 *   pluginContext={ctx}
 *   options={options}
 *   paneName="MasterPane"
 * />
 *
 * // 备份面板使用
 * <OutlinePaneContext
 *   treeMaster={treeMaster}  // 共享同一个 TreeMaster
 *   pluginContext={ctx}
 *   options={options}
 *   paneName="BackupPane"
 *   hideFilter={true}  // 备份面板通常隐藏过滤器
 * />
 * ```
 */
export function OutlinePaneContext(props: {
    treeMaster?: TreeMaster;  // 树控制器（可选）
    pluginContext: IPublicModelPluginContext;  // 插件上下文
    options: any;  // 插件配置
    paneName: string;  // 面板名称
    hideFilter?: boolean;  // 是否隐藏过滤器
}) {
    // ========== 创建或使用 TreeMaster ==========
    /**
     * TreeMaster（树控制器）
     *
     * 创建逻辑：
     * - 如果传入了 treeMaster，直接使用（主面板和备份面板共享）
     * - 如果没有传入，创建新的（独立使用）
     *
     * TreeMaster 的职责：
     * - 管理整个树的状态
     * - 监听设计器的节点变化
     * - 同步节点的增删改
     * - 提供节点查找、过滤等功能
     */
    const treeMaster = props.treeMaster || new TreeMaster(props.pluginContext, props.options);

    // ========== 创建 PaneController ==========
    /**
     * PaneController（面板控制器）
     *
     * 使用 useState 的函数初始化形式：
     * - 只在组件首次渲染时执行
     * - 避免每次渲染都创建新实例
     *
     * PaneController 的职责：
     * - 管理单个面板的状态（展开、折叠、选中等）
     * - 处理用户交互（点击、拖拽、右键菜单等）
     * - 提供面板级别的操作方法
     *
     * 为什么主面板和备份面板需要不同的 Controller？
     * - 两个面板的展开/折叠状态可能不同
     * - 两个面板的选中状态可能不同
     * - 需要独立管理各自的 UI 状态
     */
    const [masterPaneController, setMasterPaneController] = useState(
        () => new PaneController(props.paneName || MasterPaneName, treeMaster),
    );

    // ========== 监听插件上下文变化 ==========
    /**
     * useEffect 监听上下文变化
     *
     * 为什么需要监听？
     * - 用户可能切换文档（从页面A切换到页面B）
     * - 文档切换时，树的内容需要更新
     * - 需要重新创建 PaneController 以重置状态
     *
     * 清理函数：
     * - useEffect 返回的函数会在组件卸载时执行
     * - 取消事件监听，避免内存泄漏
     *
     * 空依赖数组 []：
     * - 只在组件挂载时执行一次
     * - 组件卸载时执行清理
     */
    useEffect(() => {
        return treeMaster.onPluginContextChange(() => {
            // 插件上下文变化时，重新创建 PaneController
            // 这会触发组件重新渲染（因为 state 变化）
            setMasterPaneController(new PaneController(props.paneName || MasterPaneName, treeMaster));
        });
    }, []);  // 空依赖，只执行一次

    // ========== 渲染 Pane 组件 ==========
    /**
     * 渲染面板视图
     *
     * 关键属性：
     * - treeMaster: 树控制器，提供数据和逻辑
     * - controller: 面板控制器，管理面板状态
     * - key: 使用 controller.id 作为 key
     *   - 确保 controller 变化时重新渲染整个 Pane
     *   - 重置所有内部状态
     * - hideFilter: 控制是否显示过滤器
     * - ...props: 透传其他属性
     */
    return (
        <Pane
            treeMaster={treeMaster}  // 树控制器
            controller={masterPaneController}  // 面板控制器
            key={masterPaneController.id}  // 使用 controller.id 作为 key，确保重新渲染
            hideFilter={props.hideFilter}  // 是否隐藏过滤器
            {...props}  // 透传其他属性
        />
    );
}

// ==================== 大纲树插件主函数 ====================
/**
 * OutlinePlugin - 大纲树插件
 *
 * 插件类型：低代码编辑器的内置插件
 *
 * 核心功能：
 * 1. 创建主面板（左侧）和备份面板（右侧）
 * 2. 实现双面板的智能切换机制
 * 3. 监听设计器事件，同步树状态
 * 4. 监听用户选中，自动展开父节点
 * 5. 记住用户的面板状态（固定/浮动）
 *
 * 插件函数签名：
 * @param ctx - 插件上下文，提供编辑器的所有 API
 * @param options - 插件配置选项
 * @returns 插件对象，包含 init 方法
 *
 * 插件上下文提供的 API：
 * - skeleton: 骨架系统，用于添加面板
 * - config: 配置管理器，读取和保存配置
 * - canvas: 画布 API，访问拖拽系统
 * - project: 项目 API，访问文档和节点
 * - designer: 设计器 API
 * - material: 物料 API
 * - ... 其他 API
 *
 * @example
 * ```typescript
 * // 注册插件
 * await plugins.register(OutlinePlugin, {
 *   // 插件配置
 *   enableDragAndDrop: true,
 *   showFilter: true
 * });
 *
 * // 插件会自动：
 * // 1. 在左侧添加大纲树面板
 * // 2. 在右侧添加备份面板（初始隐藏）
 * // 3. 监听拖拽事件，智能切换面板
 * ```
 */
export const OutlinePlugin = (ctx: IPublicModelPluginContext, options: any) => {
    // ========== 解构插件上下文 ==========
    // 从上下文中获取需要的 API
    const { skeleton, config, canvas, project } = ctx;

    // ========== 读取用户偏好：面板位置 ==========
    /**
     * 判断大纲树面板应该在浮动区域还是固定区域
     *
     * 逻辑：
     * 1. 检查是否有保存的偏好设置
     * 2. 如果有，使用保存的值
     * 3. 如果没有，默认为 true（浮动区域）
     *
     * 为什么默认是浮动？
     * - 浮动面板可以拖拽调整
     * - 用户体验更灵活
     * - 符合大多数用户的习惯
     */
    let isInFloatArea = true;  // 默认在浮动区域
    const hasPreferenceForOutline = config.getPreference().contains('outline-pane-pinned-status-isFloat', 'skeleton');
    if (hasPreferenceForOutline) {
        // 有保存的偏好，使用保存的值
        isInFloatArea = config.getPreference().get('outline-pane-pinned-status-isFloat', 'skeleton');
    }

    // ========== 面板显示状态追踪 ==========
    /**
     * 追踪主面板和备份面板的显示状态
     *
     * 用途：
     * - 判断是否需要显示备份面板
     * - 避免重复显示/隐藏
     *
     * 状态说明：
     * - masterPane: 主面板是否显示
     * - backupPane: 备份面板是否显示
     *
     * 为什么需要追踪？
     * - 拖拽时的智能切换依赖这些状态
     * - 避免不必要的面板切换
     */
    const showingPanes = {
        masterPane: false,  // 主面板显示状态
        backupPane: false,  // 备份面板显示状态
    };

    // ========== 创建树控制器 ==========
    /**
     * TreeMaster 实例
     *
     * 职责：
     * - 管理整个大纲树
     * - 监听设计器节点变化
     * - 同步树节点和设计器节点
     * - 提供树操作方法
     *
     * 生命周期：
     * - 插件初始化时创建
     * - 插件卸载时销毁
     * - 主面板和备份面板共享同一个实例
     */
    const treeMaster = new TreeMaster(ctx, options);

    // ========== 返回插件对象 ==========
    return {
        /**
         * 插件初始化方法
         *
         * 执行时机：
         * - 插件注册后自动调用
         * - 引擎启动时执行
         *
         * 初始化内容：
         * 1. 添加主面板到左侧区域
         * 2. 添加备份面板到右侧区域（初始隐藏）
         * 3. 设置拖拽时的面板切换逻辑
         * 4. 监听面板显示/隐藏事件
         * 5. 监听文档切换和节点选中
         */
        async init() {
            // ===== 第1步：添加主面板（MasterPane）=====
            /**
             * 主面板配置
             *
             * 位置：左侧区域（leftArea）
             * 类型：PanelDock（面板停靠容器）
             *
             * 配置说明：
             * - area: 'leftArea' - 添加到左侧区域
             * - name: 'outlinePane' - 面板唯一标识
             * - type: 'PanelDock' - 面板停靠容器类型
             * - index: -1 - 显示顺序（-1 表示最前面）
             * - content: 面板内容配置
             * - panelProps: 面板属性
             * - contentProps: 内容组件的属性
             */
            skeleton.add({
                area: 'leftArea',  // 左侧区域
                name: 'outlinePane',  // 面板名称
                type: 'PanelDock',  // 面板停靠容器
                index: -1,  // 显示顺序（负数表示靠前）

                // --- 面板内容配置 ---
                content: {
                    name: MasterPaneName,  // 面板内容名称：'MasterPane'
                    props: {
                        icon: IconOutline,  // 面板图标（大纲树图标）
                        description: treeMaster.pluginContext.intlNode('Outline Tree'),  // 国际化标题
                    },
                    content: OutlinePaneContext,  // 面板内容组件
                },

                // --- 面板属性 ---
                panelProps: {
                    // 根据用户偏好决定在浮动区域还是固定区域
                    area: isInFloatArea ? 'leftFloatArea' : 'leftFixedArea',
                    keepVisibleWhileDragging: true,  // 拖拽时保持可见
                    ...config.get('defaultOutlinePaneProps'),  // 合并默认配置
                },

                // --- 内容组件属性 ---
                contentProps: {
                    treeTitleExtra: config.get('treeTitleExtra'),  // 标题额外内容
                    treeMaster,  // 树控制器
                    paneName: MasterPaneName,  // 面板名称
                },
            });

            // ===== 第2步：添加备份面板（BackupPane）=====
            /**
             * 备份面板配置
             *
             * 位置：右侧区域（rightArea）
             * 类型：Panel（独立面板）
             *
             * 特点：
             * - 初始隐藏（hiddenWhenInit: true）
             * - 只在拖拽时显示
             * - 与主面板共享同一个 TreeMaster
             * - 不显示过滤器（通过 hideFilter 控制）
             *
             * 为什么需要备份面板？
             * ```
             * 场景：用户从组件库拖拽组件到画布
             *
             * 问题：
             * - 拖拽时鼠标在画布上移动
             * - 主面板（左侧）可能被遮挡
             * - 用户看不到目标插入位置
             *
             * 解决：
             * - 拖拽开始时，在右侧显示备份面板
             * - 备份面板显示相同的树结构
             * - 用户可以在右侧清楚看到层级关系
             * - 拖拽结束后自动隐藏
             * ```
             */
            skeleton.add({
                area: 'rightArea',  // 右侧区域
                name: BackupPaneName,  // 面板名称：'BackupPane'
                type: 'Panel',  // 独立面板类型
                props: {
                    hiddenWhenInit: true,  // 初始隐藏
                },
                content: OutlinePaneContext,  // 使用相同的内容组件
                contentProps: {
                    paneName: BackupPaneName,  // 面板名称
                    treeMaster,  // 共享同一个 TreeMaster
                    hideFilter: true,  // 隐藏过滤器（备份面板不需要）
                },
                index: 1,  // 显示顺序
            });

            // ===== 第3步：实现面板智能切换逻辑 =====
            /**
             * 面板切换函数
             *
             * 核心逻辑：
             * 1. 判断是否正在拖拽
             * 2. 判断是否有可见的大纲树面板
             * 3. 如果拖拽中且没有可见面板 -> 显示备份面板
             * 4. 否则 -> 隐藏备份面板
             *
             * 决策表：
             * ```
             * | 拖拽中 | 主面板可见 | 备份面板可见 | 操作 |
             * |--------|-----------|-------------|------|
             * | 是     | 是        | -           | 隐藏备份 |
             * | 是     | 否        | 是          | 保持 |
             * | 是     | 否        | 否          | 显示备份 |
             * | 否     | -         | 是          | 隐藏备份 |
             * ```
             *
             * 使用场景：
             * - 拖拽开始：调用 switchPanes()
             * - 拖拽结束：调用 switchPanes()
             * - 主面板隐藏：调用 switchPanes()
             */
            const switchPanes = () => {
                // 判断是否正在拖拽
                const isDragging = canvas.dragon?.dragging;

                // 判断是否有可见的大纲树面板（主面板或备份面板）
                const hasVisibleTreeBoard = showingPanes.backupPane || showingPanes.masterPane;

                // 决策：是否应该显示备份面板
                // 条件：拖拽中 且 没有可见的大纲树面板
                const shouldShowBackupPane = isDragging && !hasVisibleTreeBoard;

                if (shouldShowBackupPane) {
                    // 显示备份面板
                    skeleton.showPanel(BackupPaneName);
                } else {
                    // 隐藏备份面板
                    skeleton.hidePanel(BackupPaneName);
                }
            };

            // ===== 第4步：监听拖拽事件 =====
            /**
             * 拖拽开始事件
             *
             * 时机：用户开始拖拽组件或节点
             *
             * 处理：调用 switchPanes() 决定是否显示备份面板
             */
            canvas.dragon?.onDragstart(() => {
                switchPanes();
            });

            /**
             * 拖拽结束事件
             *
             * 时机：用户松开鼠标，完成拖拽
             *
             * 处理：调用 switchPanes()，通常会隐藏备份面板
             */
            canvas.dragon?.onDragend(() => {
                switchPanes();
            });

            // ===== 第5步：监听面板显示事件 =====
            /**
             * 监听面板显示
             *
             * 功能：
             * - 更新 showingPanes 状态
             * - 追踪哪些面板正在显示
             *
             * 为什么需要监听？
             * - 用户可能手动显示/隐藏主面板
             * - switchPanes() 需要知道当前状态
             * - 避免重复显示面板
             */
            skeleton.onShowPanel((key: string) => {
                if (key === MasterPaneName) {
                    showingPanes.masterPane = true;  // 主面板显示
                }
                if (key === BackupPaneName) {
                    showingPanes.backupPane = true;  // 备份面板显示
                }
            });

            // ===== 第6步：监听面板隐藏事件 =====
            /**
             * 监听面板隐藏
             *
             * 功能：
             * - 更新 showingPanes 状态
             * - 主面板隐藏时，检查是否需要显示备份面板
             *
             * 特殊处理：
             * - 主面板隐藏时调用 switchPanes()
             * - 如果正在拖拽，会自动显示备份面板
             * - 保证拖拽时始终有一个大纲树面板可见
             */
            skeleton.onHidePanel((key: string) => {
                if (key === MasterPaneName) {
                    showingPanes.masterPane = false;  // 主面板隐藏
                    switchPanes();  // 检查是否需要显示备份面板
                }
                if (key === BackupPaneName) {
                    showingPanes.backupPane = false;  // 备份面板隐藏
                }
            });

            // ===== 第7步：监听文档切换和节点选中 =====
            /**
             * 监听文档切换事件
             *
             * 场景：用户在多页面项目中切换文档
             *
             * 功能：
             * - 监听节点选中事件
             * - 自动展开被选中节点的所有祖先节点
             *
             * 为什么需要展开祖先节点？
             * ```
             * 树结构：
             * Page
             * └─ Container (折叠)
             *    └─ Button (选中，但被折叠了，看不到)
             *
             * 处理后：
             * Page
             * └─ Container (展开)  <- 自动展开
             *    └─ Button (选中，现在可以看到了)
             * ```
             */
            project.onChangeDocument((document: IPublicModelDocumentModel) => {
                // 文档为空检查
                if (!document) {
                    return;
                }

                // 获取文档的选中管理器
                const { selection } = document;

                // 监听选中变化
                selection?.onSelectionChange(() => {
                    // 获取当前选中的节点
                    const selectedNodes = selection?.getNodes();
                    if (!selectedNodes || selectedNodes.length === 0) {
                        return;  // 没有选中节点，不处理
                    }

                    // 获取当前树
                    const tree = treeMaster.currentTree;

                    // 遍历所有选中的节点
                    selectedNodes.forEach((node) => {
                        // 获取对应的树节点
                        const treeNode = tree?.getTreeNodeById(node.id);
                        // 展开所有祖先节点
                        tree?.expandAllAncestors(treeNode);
                    });
                });
            });
        },
    };
};

// ==================== 插件元数据 ====================
/**
 * 插件元数据
 *
 * eventPrefix: 事件前缀
 * - 插件发送的事件都会加上这个前缀
 * - 例如：'OutlinePlugin:nodeClick'
 *
 * preferenceDeclaration: 偏好设置声明
 * - 定义插件的可配置项
 * - 会在编辑器设置面板中显示
 *
 * 配置项：
 * - extraTitle: 副标题配置
 *   - type: 'object' - 对象类型
 *   - description: '副标题' - 配置说明
 *
 * 使用场景：
 * ```typescript
 * // 用户在设置面板中配置
 * config.set('extraTitle', {
 *   text: '当前页面',
 *   icon: 'page'
 * });
 *
 * // 插件读取配置
 * const extraTitle = config.get('extraTitle');
 * // 在树标题中显示副标题
 * ```
 */
OutlinePlugin.meta = {
    eventPrefix: 'OutlinePlugin',  // 事件前缀
    preferenceDeclaration: {
        title: '大纲树插件配置',
        properties: [
            {
                key: 'extraTitle',
                type: 'object',
                description: '副标题',
            },
        ],
    },
};

/**
 * 插件名称
 *
 * 用途：
 * - 插件的唯一标识
 * - 用于插件管理（注册、卸载等）
 * - 日志和调试中显示
 */
OutlinePlugin.pluginName = 'OutlinePlugin';
