import {createElement} from 'react';
import {render, unmountComponentAtNode} from 'react-dom';
import {
    IPublicTypeEngineOptions,
    IPublicModelDocumentModel,
    IPublicTypePluginMeta,
    IPublicTypeDisposable,
    IPublicApiPlugins,
    IPublicApiWorkspace,
    IPublicEnumPluginRegisterLevel,
    IPublicModelPluginContext,
} from '@alilc/lowcode-types';

import {
    globalContext,
    Editor,
    commonEvent,
    engineConfig,
    Setters as InnerSetters,
    Hotkey as InnerHotkey,
    IEditor,
    Command as InnerCommand,
} from '../../editor-core/src';
import {
    Designer,
    LowCodePluginManager,
    ILowCodePluginContextPrivate,
    ILowCodePluginContextApiAssembler,
    PluginPreference,
    IDesigner,
} from '../../designer/src';
import {Skeleton as InnerSkeleton, registerDefaults} from '../../editor-skeleton/src';
import {Workspace as InnerWorkspace, Workbench as WorkSpaceWorkbench, IWorkspace} from '../../workspace/src';
import {
    Hotkey,
    Project,
    Skeleton,
    Setters,
    Material,
    Event,
    Plugins,
    Common,
    Logger,
    Canvas,
    Workspace,
    Config,
    CommonUI,
    Command,
} from '../../shell/src';
import {isPlainObject} from '../../utils/src';
import './modules/live-editing';
import * as classes from './modules/classes';
import symbols from './modules/symbols';
import {componentMetaParser} from './inner-plugins/component-meta-parser';
import {setterRegistry} from './inner-plugins/setter-registry';
import {defaultPanelRegistry} from './inner-plugins/default-panel-registry';
import {shellModelFactory} from './modules/shell-model-factory';
import {builtinHotkey} from './inner-plugins/builtin-hotkey';
import {defaultContextMenu} from './inner-plugins/default-context-menu';
import {CommandPlugin} from '../../plugin-command/src';
import {OutlinePlugin} from '../../plugin-outline-pane/src';

export * from './modules/skeleton-types';
export * from './modules/designer-types';
export * from './modules/lowcode-types';

async function registryInnerPlugin(
    designer: IDesigner,
    editor: IEditor,
    plugins: IPublicApiPlugins,
): Promise<IPublicTypeDisposable> {
    // 注册一批内置插件
    const componentMetaParserPlugin = componentMetaParser(designer);
    const defaultPanelRegistryPlugin = defaultPanelRegistry(editor);
    await plugins.register(OutlinePlugin, {}, {autoInit: true});
    await plugins.register(componentMetaParserPlugin);
    await plugins.register(setterRegistry, {});
    await plugins.register(defaultPanelRegistryPlugin);
    await plugins.register(builtinHotkey);
    await plugins.register(registerDefaults, {}, {autoInit: true});
    await plugins.register(defaultContextMenu);
    await plugins.register(CommandPlugin, {});

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

const innerWorkspace: IWorkspace = new InnerWorkspace(registryInnerPlugin, shellModelFactory);
const workspace: IPublicApiWorkspace = new Workspace(innerWorkspace);

const editor = new Editor();

globalContext.register(editor, Editor);
globalContext.register(editor, 'editor');
globalContext.register(innerWorkspace, 'workspace');

const engineContext: Partial<ILowCodePluginContextPrivate> = {};

const innerSkeleton = new InnerSkeleton(editor);

editor.set('skeleton' as any, innerSkeleton);

const designer = new Designer({editor, shellModelFactory});
editor.set('designer' as any, designer);

const {project: innerProject} = designer;

const innerHotkey = new InnerHotkey();
const hotkey = new Hotkey(innerHotkey);
const project = new Project(innerProject);
const skeleton = new Skeleton(innerSkeleton, 'any', false);
const innerSetters = new InnerSetters();
const setters = new Setters(innerSetters);
const innerCommand = new InnerCommand();
const command = new Command(innerCommand, engineContext as IPublicModelPluginContext);

const material = new Material(editor);
const commonUI = new CommonUI(editor);

editor.set('project', project);
editor.set('setters' as any, setters);
editor.set('material', material);
editor.set('innerHotkey', innerHotkey);

const config = new Config(engineConfig);
const event = new Event(commonEvent, {prefix: 'common'});
const logger = new Logger({level: 'warn', bizName: 'common'});
const common = new Common(editor, innerSkeleton);
const canvas = new Canvas(editor);

let plugins: Plugins;

const pluginContextApiAssembler: ILowCodePluginContextApiAssembler = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    assembleApis: (context: ILowCodePluginContextPrivate, pluginName: string, meta: IPublicTypePluginMeta) => {
        context.hotkey = hotkey;
        context.project = project;
        context.skeleton = new Skeleton(innerSkeleton, pluginName, false);
        context.setters = setters;
        context.material = material;
        const eventPrefix = meta?.eventPrefix || 'common';
        const commandScope = meta?.commandScope;
        context.event = new Event(commonEvent, {prefix: eventPrefix});
        context.config = config;
        context.common = common;
        context.canvas = canvas;
        context.plugins = plugins;
        context.logger = new Logger({level: 'warn', bizName: `plugin:${pluginName}`});
        context.workspace = workspace;
        context.commonUI = commonUI;
        context.command = new Command(innerCommand, context as IPublicModelPluginContext, {
            commandScope,
        });
        context.registerLevel = IPublicEnumPluginRegisterLevel.Default;
        context.isPluginRegisteredInWorkspace = false;
        editor.set('pluginContext', context);
    },
};

const innerPlugins = new LowCodePluginManager(pluginContextApiAssembler);

plugins = new Plugins(innerPlugins).toProxy();
editor.set('innerPlugins' as any, innerPlugins);
editor.set('plugins' as any, plugins);

engineContext.skeleton = skeleton;
engineContext.plugins = plugins;
engineContext.project = project;
engineContext.setters = setters;
engineContext.material = material;
engineContext.event = event;
engineContext.logger = logger;
engineContext.hotkey = hotkey;
engineContext.common = common;
engineContext.workspace = workspace;
engineContext.canvas = canvas;
engineContext.commonUI = commonUI;
engineContext.command = command;

// declare this is open-source version
export const isOpenSource = true;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
    symbols,
    classes,
};

engineConfig.set('isOpenSource', isOpenSource);

// container which will host LowCodeEngine DOM
let engineContainer: HTMLElement;
// @ts-ignore webpack Define variable
export const version = VERSION_PLACEHOLDER;

engineConfig.set('ENGINE_VERSION', version);

const pluginPromise = registryInnerPlugin(designer, editor, plugins);

export async function init(
    container?: HTMLElement,
    options?: IPublicTypeEngineOptions,
    pluginPreference?: PluginPreference,
) {
    await destroy();

    let engineOptions = null;

    if (isPlainObject(container)) {
        engineOptions = container;
        engineContainer = document.createElement('div');
        engineContainer.id = 'engine';

        document.body.appendChild(engineContainer);
    } else {
        engineOptions = options;
        engineContainer = container;

        if (!container) {
            engineContainer = document.createElement('div');
            engineContainer.id = 'engine';
            document.body.appendChild(engineContainer);
        }
    }

    engineConfig.setEngineOptions(engineOptions as any);

    const {Workbench} = common.skeletonCabin;

    // 应用级设计模式
    if (options && options.enableWorkspaceMode) {
        const disposeFun = await pluginPromise;
        disposeFun && disposeFun();

        render(
            createElement(WorkSpaceWorkbench, {
                workspace: innerWorkspace,
                // skeleton: workspace.skeleton,
                className: 'engine-main',
                topAreaItemClassName: 'engine-actionitem',
            }),
            engineContainer,
        );
        innerWorkspace.enableAutoOpenFirstWindow = engineConfig.get('enableAutoOpenFirstWindow', true);
        innerWorkspace.setActive(true);
        innerWorkspace.initWindow();
        innerHotkey.activate(false);
        await innerWorkspace.plugins.init(pluginPreference);
        return;
    }

    // 普通模式
    await plugins.init(pluginPreference as any);
    render(
        createElement(Workbench, {
            skeleton: innerSkeleton,
            className: 'engine-main',
            topAreaItemClassName: 'engine-actionitem',
        }),
        engineContainer,
    );
}

export async function destroy() {
    // remove all documents
    const {documents} = project;
    if (Array.isArray(documents) && documents.length > 0) {
        documents.forEach((doc: IPublicModelDocumentModel) => project.removeDocument(doc));
    }

    // TODO: delete plugins except for core plugins

    // unmount DOM container, this will trigger React componentWillUnmount lifeCycle,
    // so necessary cleanups will be done.
    engineContainer && unmountComponentAtNode(engineContainer);
}

export {
    skeleton,
    plugins,
    project,
    setters,
    material,
    config,
    event,
    logger,
    hotkey,
    common,
    workspace,
    canvas,
    commonUI,
    command,
};
