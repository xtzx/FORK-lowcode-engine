import { Component } from 'react'; // React 基础组件类，用于创建类组件
import { TipContainer, engineConfig, observer } from '@alilc/lowcode-editor-core'; // TipContainer: 全局提示容器, engineConfig: 引擎配置管理器, observer: MobX 响应式装饰器
import { WindowView } from '../view/window-view'; // 窗口视图组件：管理单个编辑器窗口的渲染和生命周期
import classNames from 'classnames'; // CSS 类名组合工具，用于动态组合样式类
import { SkeletonContext } from '../skeleton-context'; // 骨架系统的 React Context，用于跨组件传递 skeleton 实例
import { EditorConfig, PluginClassSet } from '@alilc/lowcode-types'; // 编辑器配置和插件集合的类型定义
import { Workspace } from '../workspace'; // 工作空间类：管理多窗口、资源、插件、状态等核心逻辑
import {
    BottomArea, // 底部区域组件：控制台、日志、调试信息等
    LeftArea, // 左侧区域组件：组件库、资源管理器等
    LeftFixedPane, // 左侧固定面板：永久显示的功能区域
    LeftFloatPane, // 左侧浮动面板：可收起的辅助工具
    MainArea, // 主区域组件：全局浮动面板、调试工具等（工作空间模式下较少使用）
    SubTopArea, // 子顶部区域：窗口标签页、窗口级操作按钮等
    TopArea, // 顶部区域组件：全局操作、项目切换、用户信息等
} from '@alilc/lowcode-editor-skeleton'; // 从骨架包导入各个布局区域组件

// @observer 装饰器：使组件响应 MobX observable 数据变化，实现响应式更新
// 工作空间模式 Workbench（别名 WorkSpaceWorkbench）：多窗口管理的高级布局容器
@observer
export class Workbench extends Component<
    {
        workspace: Workspace; // 工作空间实例：管理多个编辑器窗口、资源、全局状态
        config?: EditorConfig; // 编辑器配置：主题、布局、功能开关等设置
        components?: PluginClassSet; // 插件组件集合：用于扩展编辑器功能
        className?: string; // 自定义 CSS 类名：用于样式定制
        topAreaItemClassName?: string; // 顶部区域项的样式类名
    },
    {
        workspaceEmptyComponent: any; // 空工作区组件：当没有窗口时显示的组件（欢迎页、引导页等）
        theme?: string; // 当前主题：支持动态主题切换（暗黑模式、明亮模式等）
    }
> {
    constructor(props: any) {
        super(props);
        const { config, components, workspace } = this.props;
        const { skeleton } = workspace; // 从工作空间获取骨架系统实例
        // 构建骨架系统：注册插件到各个区域，初始化布局配置
        skeleton.buildFromConfig(config, components);

        // 监听主题配置变化：实现动态主题切换功能
        // 当全局主题配置更新时，自动更新组件状态并重新渲染
        engineConfig.onGot('theme', (theme) => {
            this.setState({
                theme,
            });
        });

        // 监听空工作区组件配置变化：支持动态配置欢迎页组件
        // 当没有任何窗口打开时，显示此组件（如项目选择、快速开始等）
        engineConfig.onGot('workspaceEmptyComponent', (workspaceEmptyComponent) => {
            this.setState({
                workspaceEmptyComponent,
            });
        });

        // 初始化组件状态：从全局配置中获取初始值
        this.state = {
            workspaceEmptyComponent: engineConfig.get('workspaceEmptyComponent'), // 获取空工作区组件配置
            theme: engineConfig.get('theme'), // 获取当前主题配置
        };
    }

    render() {
        const { workspace, className, topAreaItemClassName } = this.props; // 获取传入的工作空间实例和样式配置
        const { skeleton } = workspace; // 从工作空间获取骨架系统实例
        const { workspaceEmptyComponent: WorkspaceEmptyComponent, theme } = this.state; // 获取空工作区组件和当前主题

        return (
            // 工作空间根容器：应用基础样式、自定义类名和当前主题
            <div className={classNames('lc-workspace-workbench', className, theme)}>
                {/* 骨架系统上下文：向所有子组件提供 skeleton 实例的访问 */}
                <SkeletonContext.Provider value={skeleton}>
                    {/* 顶部区域：全局工具栏，包含项目切换、用户信息、全局操作等 */}
                    <TopArea
                        className="lc-workspace-top-area" // 工作空间专用的顶部样式
                        area={skeleton.topArea} // 骨架系统的顶部区域配置
                        itemClassName={topAreaItemClassName} // 顶部项目的统一样式
                    />
                    {/* 工作台主体：包含所有功能面板和编辑区域 */}
                    <div className="lc-workspace-workbench-body">
                        {/* 左侧主区域：组件库、页面管理、资源浏览器等 */}
                        <LeftArea className="lc-workspace-left-area lc-left-area" area={skeleton.leftArea} />
                        {/* 左侧浮动面板：可展开收起的辅助工具面板 */}
                        <LeftFloatPane area={skeleton.leftFloatArea} />
                        {/* 左侧固定面板：永久显示的快捷功能和导航 */}
                        <LeftFixedPane area={skeleton.leftFixedArea} />
                        {/* 中央工作区容器：核心编辑和管理区域 */}
                        <div className="lc-workspace-workbench-center">
                            {/* 中央内容区：包含窗口标签和窗口内容 */}
                            <div className="lc-workspace-workbench-center-content">
                                {/* 子顶部区域：窗口标签页、窗口级操作按钮、面包屑导航等 */}
                                <SubTopArea area={skeleton.subTopArea} itemClassName={topAreaItemClassName} />
                                {/* 🔥 核心窗口管理区域：多窗口动态渲染的关键容器 */}
                                <div className="lc-workspace-workbench-window">
                                    {/* 遍历所有打开的窗口，为每个窗口创建对应的 WindowView */}
                                    {workspace.windows.map((d) => (
                                        <WindowView
                                            active={d.id === workspace.window?.id} // 判断是否为当前激活的窗口
                                            window={d} // 传入窗口实例，包含资源、配置等信息
                                            key={d.id} // 使用窗口 ID 作为 React key，确保正确的组件更新
                                        />
                                    ))}

                                    {/* 空工作区处理：当没有打开任何窗口时显示欢迎组件 */}
                                    {!workspace.windows.length && WorkspaceEmptyComponent ? (
                                        <WorkspaceEmptyComponent /> // 渲染欢迎页、快速开始、项目选择等组件
                                    ) : null}
                                </div>
                            </div>
                            {/* 主区域：在工作空间模式下通常用于全局浮动面板、调试工具等 */}
                            {/* 不像普通模式那样是核心编辑区域 */}
                            <MainArea area={skeleton.mainArea} />
                            {/* 底部区域：全局控制台、输出面板、问题列表等调试工具 */}
                            <BottomArea area={skeleton.bottomArea} />
                        </div>
                        {/* 右侧区域被注释：在工作空间模式下，属性面板等通常在各个窗口内部独立管理 */}
                        {/* 避免全局右侧面板与窗口内属性面板的冲突 */}
                        {/* <RightArea area={skeleton.rightArea} /> */}
                    </div>
                    {/* 全局提示容器：显示跨窗口的操作反馈、系统通知、错误信息等 */}
                    <TipContainer />
                </SkeletonContext.Provider>
            </div>
        );
    }
}
