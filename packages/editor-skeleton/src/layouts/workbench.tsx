import { Component } from 'react'; // React 基础组件类，用于创建类组件
import { TipContainer, observer } from '@alilc/lowcode-editor-core'; // TipContainer: 全局提示容器组件, observer: MobX 响应式装饰器
import classNames from 'classnames'; // 用于动态组合 CSS 类名的工具库
import { ISkeleton } from '../skeleton'; // 骨架系统接口定义，管理编辑器的各个区域和插件
import TopArea from './top-area'; // 顶部区域组件：标题栏、菜单栏、全局操作按钮
import LeftArea from './left-area'; // 左侧区域组件：组件库面板、大纲树、页面管理等
import LeftFixedPane from './left-fixed-pane'; // 左侧固定面板：不可折叠的永久显示区域
import LeftFloatPane from './left-float-pane'; // 左侧浮动面板：可折叠/展开的辅助功能区域
import Toolbar from './toolbar'; // 工具栏组件：撤销/重做、缩放、对齐等常用操作
import MainArea from './main-area'; // 主编辑区域：DesignerPlugin 的渲染位置，包含画布和模拟器
import BottomArea from './bottom-area'; // 底部区域组件：控制台、日志输出、调试信息
import RightArea from './right-area'; // 右侧区域组件：属性设置面板、样式编辑器
import './workbench.less'; // 工作台的样式文件
import { SkeletonContext } from '../context'; // 骨架系统的 React Context，用于跨组件传递 skeleton 实例
import { EditorConfig, PluginClassSet } from '@alilc/lowcode-types'; // 编辑器配置类型和插件集合类型定义

// @observer 装饰器：使组件能够响应 MobX observable 数据的变化，实现自动重新渲染
// 普通模式 Workbench：单一编辑器界面的布局容器，提供固定的区域划分
@observer
export class Workbench extends Component<{
  skeleton: ISkeleton; // 骨架系统实例，管理所有区域和插件的注册、布局
  config?: EditorConfig; // 编辑器配置对象，包含主题、布局、功能开关等设置
  components?: PluginClassSet; // 插件组件集合，用于扩展编辑器的功能
  className?: string; // 自定义 CSS 类名，用于个性化样式定制
  topAreaItemClassName?: string; // 顶部区域内项目的自定义样式类名
}> {
  constructor(props: any) {
    super(props);
    const { config, components, skeleton } = this.props;
    // 核心初始化：根据配置和组件集合构建骨架系统
    // 这一步会：1) 注册所有插件到对应区域 2) 设置区域布局规则 3) 初始化插件依赖关系
    skeleton.buildFromConfig(config, components);
  }

  render() {
    const {
      skeleton, // 骨架系统实例，包含所有区域的配置和插件
      className, // 工作台容器的自定义类名
      topAreaItemClassName, // 顶部区域项的样式类名
    } = this.props;
    return (
      // 工作台根容器：应用基础样式 'lc-workbench' 和自定义类名
      <div className={classNames('lc-workbench', className)}>
        {/* Context Provider：向所有子组件提供 skeleton 实例的访问能力 */}
        {/* 这样所有区域组件都能通过 useContext 访问到骨架系统 */}
        <SkeletonContext.Provider value={this.props.skeleton}>
          {/* 顶部区域：展示项目信息、全局操作按钮、菜单栏等 */}
          {/* itemClassName 用于统一顶部项目的样式风格 */}
          <TopArea area={skeleton.topArea} itemClassName={topAreaItemClassName} />
          {/* 工作台主体：包含左侧面板、中央编辑区、右侧面板的容器 */}
          <div className="lc-workbench-body">
            {/* 左侧主区域：组件库面板，展示可拖拽的组件列表 */}
            <LeftArea area={skeleton.leftArea} />
            {/* 左侧浮动面板：可展开/收起的辅助工具面板，如大纲树 */}
            <LeftFloatPane area={skeleton.leftFloatArea} />
            {/* 左侧固定面板：始终显示的快捷功能区域 */}
            <LeftFixedPane area={skeleton.leftFixedArea} />
            {/* 中央工作区：编辑器的核心区域容器 */}
            <div className="lc-workbench-center">
              {/* 工具栏：包含撤销、重做、缩放、预览等常用操作按钮 */}
              <Toolbar area={skeleton.toolbar} />
              {/* 🔥 主编辑区域：最重要的区域，DesignerPlugin 在此渲染 */}
              {/* 包含：画布、模拟器、拖拽交互、组件选中等核心功能 */}
              <MainArea area={skeleton.mainArea} />
              {/* 底部区域：控制台输出、错误日志、构建信息等调试工具 */}
              <BottomArea area={skeleton.bottomArea} />
            </div>
            {/* 右侧区域：属性设置面板、样式编辑器、事件绑定等配置工具 */}
            <RightArea area={skeleton.rightArea} />
          </div>
          {/* 全局提示容器：显示操作反馈、错误信息、帮助提示等 */}
          <TipContainer />
        </SkeletonContext.Provider>
      </div>
    );
  }
}
