import React, { PureComponent } from 'react'; // React 基础库，PureComponent 提供浅比较优化
import { Editor, engineConfig } from '@alilc/lowcode-editor-core'; // Editor: 编辑器核心实例, engineConfig: 引擎全局配置管理器
import { DesignerView, Designer } from '@alilc/lowcode-designer'; // DesignerView: 设计器视图组件, Designer: 设计器核心类
import { Asset, getLogger } from '@alilc/lowcode-utils'; // Asset: 资产类型定义, getLogger: 日志工具
import './index.scss'; // 插件样式文件

// 创建插件专用的日志记录器，用于调试和错误追踪
const logger = getLogger({ level: 'warn', bizName: 'plugin:plugin-designer' });

// 插件组件的 Props 接口定义
export interface PluginProps {
    engineEditor: Editor; // 从引擎传入的编辑器实例
}

// 设计器插件的状态接口定义
// 管理所有与设计器相关的配置和资源状态
interface DesignerPluginState {
    componentMetadatas?: any[] | null; // 组件元数据数组：描述可用组件的属性、事件等信息
    library?: any[] | null; // 组件库数组：实际的组件实现代码（如 view.js）
    extraEnvironment?: any[] | null; // 额外环境配置：运行时需要的额外依赖或配置
    renderEnv?: string; // 渲染环境：如 'react', 'rax' 等
    device?: string; // 设备类型：如 'desktop', 'mobile' 等
    locale?: string; // 语言地区：如 'zh-CN', 'en-US' 等
    designMode?: string; // 设计模式：如 'design', 'live' 等
    deviceClassName?: string; // 设备样式类名：用于响应式布局
    simulatorUrl: Asset | null; // 模拟器 URL：iframe 内渲染器的地址
    // @TODO 类型定义 - 待完善类型定义
    requestHandlersMap: any; // 请求处理器映射：自定义 API 请求处理逻辑
}

/**
 * DesignerPlugin 核心职责：
 * 1. 作为设计器的桥梁组件，连接引擎和设计器视图
 * 2. 管理设计器所需的所有资源和配置状态
 * 3. 监听引擎配置变化并同步更新设计器
 * 4. 处理设计器的生命周期和事件
 */
export default class DesignerPlugin extends PureComponent<PluginProps, DesignerPluginState> {
    static displayName: 'LowcodePluginDesigner'; // React DevTools 中显示的组件名

    // 初始化组件状态，设置默认值
    state: DesignerPluginState = {
        componentMetadatas: null, // 初始为 null，等待异步加载
        library: null, // 初始为 null，等待异步加载
        extraEnvironment: null, // 额外环境配置
        renderEnv: 'default', // 默认渲染环境
        device: 'default', // 默认设备类型
        locale: '', // 默认语言为空，由引擎配置决定
        designMode: 'live', // 默认为实时设计模式
        deviceClassName: '', // 默认无特殊设备样式
        simulatorUrl: null, // 模拟器地址待配置
        requestHandlersMap: null, // 请求处理器映射待配置
    };

    // 组件挂载状态标记，用于防止组件卸载后的异步操作
    private _mounted = true;

    constructor(props: any) {
        super(props);
        // 构造函数中立即启动资产加载流程
        this.setupAssets();
    }

    /**
     * 核心方法：初始化所需的资源和配置
     * 职责：
     * 1. 从编辑器获取资产配置（components、packages等）
     * 2. 从全局配置获取运行时参数（设备、语言等）
     * 3. 设置配置变化监听器，实现响应式更新
     * 4. 统一更新组件状态
     */
    private async setupAssets() {
        const editor = this.props.engineEditor; // 获取编辑器实例
        try {
            // 等待编辑器资产准备就绪（这是一个异步操作）
            // assets 包含：components（组件元数据）、packages（组件实现）、utils（工具函数）等
            const assets = await editor.onceGot('assets');

            // 从全局配置或编辑器实例获取各种运行时配置
            // 优先级：engineConfig（全局） > editor（实例）
            const renderEnv = engineConfig.get('renderEnv') || editor.get('renderEnv'); // 渲染环境配置
            const device = engineConfig.get('device') || editor.get('device'); // 当前设备类型
            const locale = engineConfig.get('locale') || editor.get('locale'); // 当前语言环境
            const designMode = engineConfig.get('designMode') || editor.get('designMode'); // 设计模式
            const deviceClassName = engineConfig.get('deviceClassName') || editor.get('deviceClassName'); // 设备CSS类名
            const simulatorUrl = engineConfig.get('simulatorUrl') || editor.get('simulatorUrl'); // 模拟器地址
            // @TODO setupAssets 里设置 requestHandlersMap 不太合适 - 应该考虑重构到更合适的地方
            const requestHandlersMap = engineConfig.get('requestHandlersMap') || editor.get('requestHandlersMap'); // 请求处理器

            // 防御性编程：如果组件已卸载，则不执行后续操作
            if (!this._mounted) {
                return;
            }

            // 🔥 关键：设置配置变化监听器，实现响应式更新
            // 当全局语言配置改变时，自动更新组件状态
            engineConfig.onGot('locale', (locale) => {
                this.setState({
                    locale,
                });
            });
            // 当请求处理器配置改变时，自动更新组件状态
            engineConfig.onGot('requestHandlersMap', (requestHandlersMap) => {
                this.setState({
                    requestHandlersMap,
                });
            });
            // 当设备类型配置改变时，自动更新组件状态
            engineConfig.onGot('device', (device) => {
                this.setState({
                    device,
                });
            });

            // 从资产对象中解构出各类资源
            const { components, packages, extraEnvironment, utils } = assets;

            // 构建完整的状态对象，准备更新组件状态
            const state = {
                componentMetadatas: components || [], // 组件元数据：组件的属性定义、配置项等
                library: packages || [], // 🔥 关键：packages 重命名为 library，这是组件的实际实现代码
                utilsMetadata: utils || [], // 工具函数元数据
                extraEnvironment, // 额外的运行环境配置
                renderEnv, // 渲染器环境类型
                device, // 设备类型
                designMode, // 设计模式
                deviceClassName, // 设备相关的CSS类名
                simulatorUrl, // 模拟器URL
                requestHandlersMap, // 自定义请求处理器
                locale, // 语言环境
            };

            // 一次性更新所有状态，触发组件重新渲染
            this.setState(state);
        } catch (e) {
            // 异常处理：记录错误信息，便于调试
            logger.error(e);
        }
    }

    /**
     * 组件卸载生命周期方法
     * 设置卸载标记，防止异步操作在组件卸载后仍然执行
     */
    componentWillUnmount() {
        this._mounted = false; // 标记组件已卸载，阻止后续异步操作
    }

    /**
     * 设计器挂载完成回调函数
     * 在 DesignerView 创建并挂载设计器实例后调用
     * 职责：
     * 1. 将设计器实例注册到编辑器中，供其他组件访问
     * 2. 发出设计器就绪事件，通知其他模块
     * 3. 监听 schema 数据，自动打开项目
     */
    private handleDesignerMount = (designer: Designer): void => {
        const editor = this.props.engineEditor;

        // 🔥 关键：将设计器实例注册到编辑器的全局容器中
        // 其他插件和组件可以通过 editor.get('designer') 访问设计器
        editor.set('designer', designer);

        // 发出设计器就绪事件，通知系统其他部分设计器已可用
        editor.eventBus.emit('designer.ready', designer);

        // 监听 schema 数据的加载
        // 当有项目 schema 数据时，自动在设计器中打开该项目
        editor.onGot('schema', (schema) => {
            designer.project.open(schema); // 在设计器中打开指定的项目schema
        });
    };

    /**
     * 渲染方法：构建设计器视图组件
     * 职责：
     * 1. 检查必要资源是否加载完成
     * 2. 将所有配置和资源传递给 DesignerView
     * 3. 建立设计器的完整运行环境
     */
    render(): React.ReactNode {
        const editor: Editor = this.props.engineEditor; // 获取编辑器实例

        // 从组件状态中解构出所有配置项和资源
        const {
            componentMetadatas, // 组件元数据：描述组件的属性、事件、方法等
            utilsMetadata, // 工具函数元数据：可在页面中使用的工具函数
            library, // 组件库：包含组件的实际实现代码（view.js）
            extraEnvironment, // 额外环境配置：运行时需要的额外依赖
            renderEnv, // 渲染环境：React、Rax 等
            device, // 设备类型：desktop、mobile 等
            designMode, // 设计模式：design、live 等
            deviceClassName, // 设备CSS类名：用于响应式样式
            simulatorUrl, // 模拟器地址：iframe 渲染器的URL
            requestHandlersMap, // 请求处理器：自定义API处理逻辑
            locale, // 语言环境：zh-CN、en-US 等
        } = this.state;

        // 🔥 关键检查：确保核心资源已加载完成
        // library（组件实现）和 componentMetadatas（组件元数据）是设计器运行的必要条件
        if (!library || !componentMetadatas) {
            // TODO: use a Loading - 建议显示加载状态而不是空白
            return null; // 资源未就绪时不渲染，避免错误
        }

        // 渲染 DesignerView：设计器的主视图组件
        return (
          <DesignerView
            // 设计器挂载完成回调：建立设计器与编辑器的连接
            onMount={this.handleDesignerMount}
            // 设置组件样式类名
            className="lowcode-plugin-designer"
            // 传入编辑器实例：提供核心服务和API
            editor={editor}
            // 视图名称：用于标识当前视图
            name={editor.viewName}
            // 设计器实例：如果已存在则复用（热更新场景）
            designer={editor.get('designer')}
            // 🔥 传入组件元数据：左侧组件库面板的数据源
            componentMetadatas={componentMetadatas}
            // 🔥 模拟器属性：传递给 iframe 内渲染器的所有配置
            simulatorProps={{
                library, // 组件实现代码：注入到 iframe 的组件库
                utilsMetadata, // 工具函数：页面可调用的辅助函数
                extraEnvironment, // 额外环境：运行时依赖配置
                renderEnv, // 渲染环境：决定使用哪种渲染器
                device, // 设备类型：影响预览效果和交互
                locale, // 语言环境：影响组件的国际化显示
                designMode, // 设计模式：控制交互行为和功能开关
                deviceClassName, // 设备样式：响应式布局的CSS类
                simulatorUrl, // 渲染器地址：iframe的src地址
                requestHandlersMap, // 请求处理：自定义数据获取逻辑
            }}
        />
        );
    }
}
