// React 相关依赖：用于创建和渲染 React 元素
import { createElement } from 'react';
import { render, unmountComponentAtNode } from 'react-dom';

// 引擎公共类型定义
import {
    IPublicTypeEngineOptions, // 引擎配置选项类型
    IPublicModelDocumentModel, // 文档模型类型
    IPublicTypePluginMeta, // 插件元信息类型
    IPublicTypeDisposable, // 可销毁对象类型
    IPublicApiPlugins, // 插件API类型
    IPublicApiWorkspace, // 工作空间API类型
    IPublicEnumPluginRegisterLevel, // 插件注册级别枚举
    IPublicModelPluginContext, // 插件上下文模型类型
} from '@alilc/lowcode-types';

// 编辑器核心模块：提供编辑器基础功能
import {
    globalContext, // 全局上下文，用于注册和获取全局服务
    Editor, // 编辑器核心类
    commonEvent, // 通用事件总线
    engineConfig, // 引擎配置管理器
    Setters as InnerSetters, // 内部设置器集合
    Hotkey as InnerHotkey, // 内部热键管理器
    IEditor, // 编辑器接口定义
    Command as InnerCommand, // 内部命令管理器
} from '../../editor-core/src';
// 设计器模块：负责可视化设计界面和插件管理
import {
    Designer, // 设计器核心类，管理画布和节点
    LowCodePluginManager, // 低代码插件管理器
    ILowCodePluginContextPrivate, // 插件私有上下文接口
    ILowCodePluginContextApiAssembler, // 插件上下文API组装器接口
    PluginPreference, // 插件偏好设置
    IDesigner, // 设计器接口定义
} from '../../designer/src';
// 编辑器骨架：提供编辑器界面布局框架
import { Skeleton as InnerSkeleton, registerDefaults } from '../../editor-skeleton/src';

// 工作空间模块：支持多窗口/多项目工作模式
import { Workspace as InnerWorkspace, Workbench as WorkSpaceWorkbench, IWorkspace } from '../../workspace/src';

// Shell模块：提供对外API的封装层
import {
    Hotkey, // 热键管理API
    Project, // 项目管理API
    Skeleton, // 骨架管理API
    Setters, // 设置器API
    Material, // 物料管理API
    Event, // 事件管理API
    Plugins, // 插件管理API
    Common, // 通用工具API
    Logger, // 日志API
    Canvas, // 画布API
    Workspace, // 工作空间API
    Config, // 配置API
    CommonUI, // 通用UI组件API
    Command, // 命令API
} from '../../shell/src';

// 工具函数
import { isPlainObject } from '../../utils/src';

// 实时编辑模块
import './modules/live-editing';

// 内部模块
import * as classes from './modules/classes'; // 类定义集合
import symbols from './modules/symbols'; // 符号常量定义

// 内置插件
import { componentMetaParser } from './inner-plugins/component-meta-parser'; // 组件元信息解析插件
import { setterRegistry } from './inner-plugins/setter-registry'; // 设置器注册插件
import { defaultPanelRegistry } from './inner-plugins/default-panel-registry'; // 默认面板注册插件
import { shellModelFactory } from './modules/shell-model-factory'; // Shell模型工厂
import { builtinHotkey } from './inner-plugins/builtin-hotkey'; // 内置热键插件
import { defaultContextMenu } from './inner-plugins/default-context-menu'; // 默认右键菜单插件

// 外部插件
import { CommandPlugin } from '../../plugin-command/src'; // 命令插件
import { OutlinePlugin } from '../../plugin-outline-pane/src'; // 大纲面板插件

// 导出类型定义
export * from './modules/skeleton-types'; // 骨架相关类型
export * from './modules/designer-types'; // 设计器相关类型
export * from './modules/lowcode-types'; // 低代码相关类型

/**
 * 注册内置插件的异步函数
 * @param designer 设计器实例
 * @param editor 编辑器实例
 * @param plugins 插件管理器实例
 * @returns 返回一个清理函数，用于删除所有注册的内置插件
 */
async function registryInnerPlugin(
    designer: IDesigner,
    editor: IEditor,
    plugins: IPublicApiPlugins,
): Promise<IPublicTypeDisposable> {
    // 创建内置插件实例
    const componentMetaParserPlugin = componentMetaParser(designer); // 组件元信息解析插件
    const defaultPanelRegistryPlugin = defaultPanelRegistry(editor); // 默认面板注册插件

    // 按序注册各个内置插件
    await plugins.register(OutlinePlugin, {}, { autoInit: true }); // 大纲面板插件（自动初始化）
    await plugins.register(componentMetaParserPlugin); // 组件元信息解析插件
    await plugins.register(setterRegistry, {}); // 设置器注册插件
    await plugins.register(defaultPanelRegistryPlugin); // 默认面板注册插件
    await plugins.register(builtinHotkey); // 内置热键插件
    await plugins.register(registerDefaults, {}, { autoInit: true }); // 默认组件注册插件（自动初始化）
    await plugins.register(defaultContextMenu); // 默认右键菜单插件
    await plugins.register(CommandPlugin, {}); // 命令插件

    // 返回清理函数，用于删除所有已注册的内置插件
    return () => {
        plugins.delete(OutlinePlugin.pluginName);
        plugins.delete(componentMetaParserPlugin.pluginName);
        plugins.delete(setterRegistry.pluginName);
        plugins.delete(defaultPanelRegistryPlugin.pluginName);
        plugins.delete(builtinHotkey.pluginName);
        plugins.delete(registerDefaults.pluginName);
        plugins.delete(defaultContextMenu.pluginName);
        plugins.delete(CommandPlugin.pluginName);
    };
}

// 创建工作空间实例（内部实现和公共API）
const innerWorkspace: IWorkspace = new InnerWorkspace(registryInnerPlugin, shellModelFactory);
const workspace: IPublicApiWorkspace = new Workspace(innerWorkspace);

// 创建编辑器核心实例
const editor = new Editor();

// 在全局上下文中注册核心服务，供其他模块使用
globalContext.register(editor, Editor); // 按类型注册编辑器
globalContext.register(editor, 'editor'); // 按名称注册编辑器
globalContext.register(innerWorkspace, 'workspace'); // 注册工作空间

// 创建引擎插件上下文对象（用于存储插件共享状态）
const engineContext: Partial<ILowCodePluginContextPrivate> = {};

// 创建编辑器骨架实例（负责界面布局）
const innerSkeleton = new InnerSkeleton(editor);
// 将骨架实例注册到编辑器中
editor.set('skeleton' as any, innerSkeleton);

// 创建设计器实例（负责可视化设计功能）
const designer = new Designer({ editor, shellModelFactory });
// 将设计器实例注册到编辑器中
editor.set('designer' as any, designer);

// 从设计器中获取项目实例
const { project: innerProject } = designer;

// 创建各种服务实例（内部实现 + 公共API封装）
const innerHotkey = new InnerHotkey(); // 内部热键管理器
const hotkey = new Hotkey(innerHotkey); // 热键API封装
const project = new Project(innerProject); // 项目API封装
const skeleton = new Skeleton(innerSkeleton, 'any', false); // 骨架API封装
const innerSetters = new InnerSetters(); // 内部设置器集合
const setters = new Setters(innerSetters); // 设置器API封装
const innerCommand = new InnerCommand(); // 内部命令管理器
const command = new Command(innerCommand, engineContext as IPublicModelPluginContext); // 命令API封装

const material = new Material(editor); // 物料管理API
const commonUI = new CommonUI(editor); // 通用UI组件API

// 将核心服务注册到编辑器中，供插件和其他模块使用
editor.set('project', project); // 注册项目服务
editor.set('setters' as any, setters); // 注册设置器服务
editor.set('material', material); // 注册物料服务
editor.set('innerHotkey', innerHotkey); // 注册内部热键服务

// 创建其他核心服务实例
const config = new Config(engineConfig); // 配置管理API
const event = new Event(commonEvent, { prefix: 'common' }); // 事件管理API（使用common前缀）
const logger = new Logger({ level: 'warn', bizName: 'common' }); // 日志服务（警告级别）
const common = new Common(editor, innerSkeleton); // 通用工具API
const canvas = new Canvas(editor); // 画布API

// 插件管理器（稍后初始化）
let plugins: Plugins;

/**
 * 插件上下文API组装器
 * 负责为每个插件创建独立的上下文环境，提供插件所需的各种API服务
 */
const pluginContextApiAssembler: ILowCodePluginContextApiAssembler = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    assembleApis: (context: ILowCodePluginContextPrivate, pluginName: string, meta: IPublicTypePluginMeta) => {
        // 为插件分配通用API服务
        context.hotkey = hotkey; // 热键管理
        context.project = project; // 项目管理
        context.skeleton = new Skeleton(innerSkeleton, pluginName, false); // 骨架管理（插件专用实例）
        context.setters = setters; // 设置器管理
        context.material = material; // 物料管理

        // 根据插件元信息配置事件和命令服务
        const eventPrefix = meta?.eventPrefix || 'common'; // 事件前缀（默认common）
        const commandScope = meta?.commandScope; // 命令作用域
        context.event = new Event(commonEvent, { prefix: eventPrefix }); // 事件管理（插件专用前缀）
        context.config = config; // 配置管理
        context.common = common; // 通用工具
        context.canvas = canvas; // 画布管理
        context.plugins = plugins; // 插件管理
        context.logger = new Logger({ level: 'warn', bizName: `plugin:${pluginName}` }); // 插件专用日志
        context.workspace = workspace; // 工作空间
        context.commonUI = commonUI; // 通用UI组件
        context.command = new Command(innerCommand, context as IPublicModelPluginContext, {
            commandScope, // 命令管理（插件专用作用域）
        });

        // 设置插件注册信息
        context.registerLevel = IPublicEnumPluginRegisterLevel.Default; // 默认注册级别
        context.isPluginRegisteredInWorkspace = false; // 标记插件未在工作空间注册
        // 将插件上下文注册到编辑器中
        editor.set('pluginContext', context);
    },
};

// 创建插件管理器实例
const innerPlugins = new LowCodePluginManager(pluginContextApiAssembler);

// 创建插件API代理对象
plugins = new Plugins(innerPlugins).toProxy();
// 将插件管理器注册到编辑器中
editor.set('innerPlugins' as any, innerPlugins);
editor.set('plugins' as any, plugins);

// 完善引擎上下文，添加所有核心服务
engineContext.skeleton = skeleton; // 骨架服务
engineContext.plugins = plugins; // 插件服务
engineContext.project = project; // 项目服务
engineContext.setters = setters; // 设置器服务
engineContext.material = material; // 物料服务
engineContext.event = event; // 事件服务
engineContext.logger = logger; // 日志服务
engineContext.hotkey = hotkey; // 热键服务
engineContext.common = common; // 通用工具服务
engineContext.workspace = workspace; // 工作空间服务
engineContext.canvas = canvas; // 画布服务
engineContext.commonUI = commonUI; // 通用UI服务
engineContext.command = command; // 命令服务

// 标识这是开源版本
export const isOpenSource = true;

// 内部API（仅供框架内部使用，外部不应依赖）
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
    symbols, // 符号常量
    classes, // 类定义
};

// 设置开源版本标识
engineConfig.set('isOpenSource', isOpenSource);

// 引擎DOM容器元素
let engineContainer: HTMLElement;

// 引擎版本号（通过webpack构建时替换）
// @ts-ignore webpack Define variable
export const version = VERSION_PLACEHOLDER;

// 设置引擎版本号到配置中
engineConfig.set('ENGINE_VERSION', version);

// 启动内置插件注册流程
const pluginPromise = registryInnerPlugin(designer, editor, plugins);

/**
 * 初始化低代码引擎
 * @param container 可选的DOM容器元素，如果未提供则自动创建
 * @param options 引擎配置选项
 * @param pluginPreference 插件偏好设置
 */
export async function init(
    container?: HTMLElement,
    options?: IPublicTypeEngineOptions,
    pluginPreference?: PluginPreference,
) {
    // 先销毁之前的实例，确保干净初始化
    await destroy();

    let engineOptions = null;

    // 处理参数重载：如果第一个参数是对象，则认为是配置选项
    if (isPlainObject(container)) {
        engineOptions = container;
        // 创建默认容器元素
        engineContainer = document.createElement('div');
        engineContainer.id = 'engine';
        document.body.appendChild(engineContainer);
    } else {
        // 正常情况：第一个参数是容器，第二个参数是配置
        engineOptions = options;
        engineContainer = container;

        // 如果没有提供容器，创建默认容器
        if (!container) {
            engineContainer = document.createElement('div');
            engineContainer.id = 'engine';
            document.body.appendChild(engineContainer);
        }
    }

    // 设置引擎配置选项
    engineConfig.setEngineOptions(engineOptions as any);

    // 获取工作台组件
    const { Workbench } = common.skeletonCabin;

    // 应用级设计模式（工作空间模式）
    if (options && options.enableWorkspaceMode) {
        // 清理之前注册的内置插件
        const disposeFun = await pluginPromise;
        disposeFun && disposeFun();

        // 渲染工作空间工作台
        render(
            createElement(WorkSpaceWorkbench, {
                workspace: innerWorkspace, // 工作空间实例
                // skeleton: workspace.skeleton, // 骨架（已注释）
                className: 'engine-main', // 主要样式类
                topAreaItemClassName: 'engine-actionitem', // 顶部区域样式类
            }),
            engineContainer,
        );
        // 配置工作空间
        innerWorkspace.enableAutoOpenFirstWindow = engineConfig.get('enableAutoOpenFirstWindow', true);
        innerWorkspace.setActive(true); // 激活工作空间
        innerWorkspace.initWindow(); // 初始化窗口
        innerHotkey.activate(false); // 激活热键（非全局模式）

        // 初始化工作空间插件
        await innerWorkspace.plugins.init(pluginPreference);
        return;
    }

    // 普通模式（单项目模式）
    await plugins.init(pluginPreference as any); // 初始化插件

    // 渲染普通工作台
    render(
        createElement(Workbench, {
            skeleton: innerSkeleton, // 编辑器骨架
            className: 'engine-main', // 主要样式类
            topAreaItemClassName: 'engine-actionitem', // 顶部区域样式类
        }),
        engineContainer,
    );
}

/**
 * 销毁引擎实例，清理所有资源
 */
export async function destroy() {
    // 移除所有文档
    const { documents } = project;
    if (Array.isArray(documents) && documents.length > 0) {
        documents.forEach((doc: IPublicModelDocumentModel) => project.removeDocument(doc));
    }

    // TODO: 删除插件（除了核心插件）

    // 卸载DOM容器，这将触发React componentWillUnmount生命周期
    // 从而完成必要的清理工作
    engineContainer && unmountComponentAtNode(engineContainer);
}

// 导出所有核心API服务，供外部使用
export {
    skeleton, // 骨架管理API
    plugins, // 插件管理API
    project, // 项目管理API
    setters, // 设置器API
    material, // 物料管理API
    config, // 配置管理API
    event, // 事件管理API
    logger, // 日志API
    hotkey, // 热键管理API
    common, // 通用工具API
    workspace, // 工作空间API
    canvas, // 画布API
    commonUI, // 通用UI组件API
    command, // 命令管理API
};
