/**
 * @file ContextMenuActions 右键菜单动作管理
 * @description 管理设计器的右键菜单系统
 *
 * 核心功能：
 * 1. 菜单动作管理：添加、删除、修改菜单项
 * 2. 全局右键监听：处理画布、大纲树等区域的右键
 * 3. 菜单渲染：将动作配置渲染为菜单
 * 4. 布局调整：自定义菜单布局
 * 5. 多实例管理：支持多个设计器实例
 *
 * 菜单类型：
 * - NODE_TREE: 大纲树右键菜单
 * - CANVAS: 画布右键菜单
 *
 * 架构：
 * ```
 * GlobalContextMenuActions（全局管理器）
 * ├── contextMenuActionsMap（实例映射）
 * │   ├── ContextMenuActions（实例1）
 * │   └── ContextMenuActions（实例2）
 * └── handleContextMenu（全局右键处理）
 * ```
 *
 * 使用场景：
 * - 画布上右键节点：显示节点操作菜单
 * - 大纲树右键：显示树节点操作菜单
 * - 插件扩展：添加自定义菜单项
 *
 * @example
 * ```typescript
 * // 添加菜单项
 * contextMenuActions.addMenuAction({
 *   name: 'custom',
 *   title: '自定义操作',
 *   action: (node) => {
 *     console.log('执行自定义操作');
 *   }
 * });
 *
 * // 移除菜单项
 * contextMenuActions.removeMenuAction('custom');
 *
 * // 调整菜单布局
 * contextMenuActions.adjustMenuLayout((items) => {
 *   // 添加分隔线
 *   items.splice(2, 0, { type: 'divider' });
 *   return items;
 * });
 * ```
 */

import { IPublicTypeContextMenuAction, IPublicEnumContextMenuType, IPublicTypeContextMenuItem, IPublicApiMaterial, IPublicModelPluginContext } from '@alilc/lowcode-types';
import { IDesigner, INode } from './designer';
import { createContextMenu, parseContextMenuAsReactNode, parseContextMenuProperties, uniqueId } from '@alilc/lowcode-utils';
import { Menu } from '@alifd/next';  // Fusion Menu 组件
import { engineConfig } from '@alilc/lowcode-editor-core';
import './context-menu-actions.scss';  // 样式文件

// ==================== IContextMenuActions 接口 ====================
/**
 * 右键菜单动作接口
 *
 * 定义右键菜单系统的公开 API
 *
 * 核心方法：
 * - addMenuAction: 添加菜单项
 * - removeMenuAction: 移除菜单项
 * - adjustMenuLayout: 调整菜单布局
 */
export interface IContextMenuActions {
  /**
   * 菜单动作列表
   *
   * 说明：
   * - 所有注册的菜单动作
   * - 按注册顺序排列
   */
  actions: IPublicTypeContextMenuAction[];

  /**
   * 菜单布局调整函数
   *
   * 用途：
   * - 自定义菜单项的顺序
   * - 添加分隔线
   * - 分组菜单项
   */
  adjustMenuLayoutFn: (actions: IPublicTypeContextMenuItem[]) => IPublicTypeContextMenuItem[];

  /**
   * 添加菜单动作方法
   *
   * 类型：与 Material API 的同名方法相同
   */
  addMenuAction: IPublicApiMaterial['addContextMenuOption'];

  /**
   * 移除菜单动作方法
   *
   * 类型：与 Material API 的同名方法相同
   */
  removeMenuAction: IPublicApiMaterial['removeContextMenuOption'];

  /**
   * 调整菜单布局方法
   *
   * 类型：与 Material API 的同名方法相同
   */
  adjustMenuLayout: IPublicApiMaterial['adjustContextMenuLayout'];
}

/**
 * 全局菜单布局调整函数
 *
 * 说明：
 * - 默认实现：不调整，直接返回
 * - 可以通过 adjustMenuLayout 修改
 *
 * 用途：
 * - 跨实例的菜单布局调整
 * - 全局的菜单定制
 */
let adjustMenuLayoutFn: Function = (actions: IPublicTypeContextMenuAction[]) => actions;

export class GlobalContextMenuActions {
  enableContextMenu: boolean;

  dispose: Function[];

  contextMenuActionsMap: Map<string, ContextMenuActions> = new Map();

  constructor() {
    this.dispose = [];

    engineConfig.onGot('enableContextMenu', (enable) => {
      if (this.enableContextMenu === enable) {
        return;
      }
      this.enableContextMenu = enable;
      this.dispose.forEach(d => d());
      if (enable) {
        this.initEvent();
      }
    });
  }

  handleContextMenu = (
    event: MouseEvent,
  ) => {
    event.stopPropagation();
    event.preventDefault();

    const actions: IPublicTypeContextMenuAction[] = [];
    let contextMenu: ContextMenuActions = this.contextMenuActionsMap.values().next().value;
    this.contextMenuActionsMap.forEach((contextMenu) => {
      actions.push(...contextMenu.actions);
    });

    let destroyFn: Function | undefined;

    const destroy = () => {
      destroyFn?.();
    };
    const pluginContext: IPublicModelPluginContext = contextMenu.designer.editor.get('pluginContext') as IPublicModelPluginContext;

    const menus: IPublicTypeContextMenuItem[] = parseContextMenuProperties(actions, {
      nodes: [],
      destroy,
      event,
      pluginContext,
    });

    if (!menus.length) {
      return;
    }

    const layoutMenu = adjustMenuLayoutFn(menus);

    const menuNode = parseContextMenuAsReactNode(layoutMenu, {
      destroy,
      nodes: [],
      pluginContext,
    });

    const target = event.target;

    const { top, left } = target?.getBoundingClientRect();

    const menuInstance = Menu.create({
      target: event.target,
      offset: [event.clientX - left, event.clientY - top],
      children: menuNode,
      className: 'engine-context-menu',
    });

    destroyFn = (menuInstance as any).destroy;
  };

  initEvent() {
    this.dispose.push(
      (() => {
        const handleContextMenu = (e: MouseEvent) => {
          this.handleContextMenu(e);
        };

        document.addEventListener('contextmenu', handleContextMenu);

        return () => {
          document.removeEventListener('contextmenu', handleContextMenu);
        };
      })(),
    );
  }

  registerContextMenuActions(contextMenu: ContextMenuActions) {
    this.contextMenuActionsMap.set(contextMenu.id, contextMenu);
  }
}

const globalContextMenuActions = new GlobalContextMenuActions();

export class ContextMenuActions implements IContextMenuActions {
  actions: IPublicTypeContextMenuAction[] = [];

  designer: IDesigner;

  dispose: Function[];

  enableContextMenu: boolean;

  id: string = uniqueId('contextMenu');;

  constructor(designer: IDesigner) {
    this.designer = designer;
    this.dispose = [];

    engineConfig.onGot('enableContextMenu', (enable) => {
      if (this.enableContextMenu === enable) {
        return;
      }
      this.enableContextMenu = enable;
      this.dispose.forEach(d => d());
      if (enable) {
        this.initEvent();
      }
    });

    globalContextMenuActions.registerContextMenuActions(this);
  }

  handleContextMenu = (
    nodes: INode[],
    event: MouseEvent,
  ) => {
    const designer = this.designer;
    event.stopPropagation();
    event.preventDefault();

    const actions = designer.contextMenuActions.actions;

    const { bounds } = designer.project.simulator?.viewport || { bounds: { left: 0, top: 0 } };
    const { left: simulatorLeft, top: simulatorTop } = bounds;

    let destroyFn: Function | undefined;

    const destroy = () => {
      destroyFn?.();
    };

    const pluginContext: IPublicModelPluginContext = this.designer.editor.get('pluginContext') as IPublicModelPluginContext;

    const menus: IPublicTypeContextMenuItem[] = parseContextMenuProperties(actions, {
      nodes: nodes.map(d => designer.shellModelFactory.createNode(d)!),
      destroy,
      event,
      pluginContext,
    });

    if (!menus.length) {
      return;
    }

    const layoutMenu = adjustMenuLayoutFn(menus);

    const menuNode = parseContextMenuAsReactNode(layoutMenu, {
      destroy,
      nodes: nodes.map(d => designer.shellModelFactory.createNode(d)!),
      pluginContext,
    });

    destroyFn = createContextMenu(menuNode, {
      event,
      offset: [simulatorLeft, simulatorTop],
    });
  };

  initEvent() {
    const designer = this.designer;
    this.dispose.push(
      designer.editor.eventBus.on('designer.builtinSimulator.contextmenu', ({
        node,
        originalEvent,
      }: {
        node: INode;
        originalEvent: MouseEvent;
      }) => {
        originalEvent.stopPropagation();
        originalEvent.preventDefault();
        // 如果右键的节点不在 当前选中的节点中，选中该节点
        if (!designer.currentSelection.has(node.id)) {
          designer.currentSelection.select(node.id);
        }
        const nodes = designer.currentSelection.getNodes();
        this.handleContextMenu(nodes, originalEvent);
      }),
    );
  }

  addMenuAction(action: IPublicTypeContextMenuAction) {
    this.actions.push({
      type: IPublicEnumContextMenuType.MENU_ITEM,
      ...action,
    });
  }

  removeMenuAction(name: string) {
    const i = this.actions.findIndex((action) => action.name === name);
    if (i > -1) {
      this.actions.splice(i, 1);
    }
  }

  adjustMenuLayout(fn: (actions: IPublicTypeContextMenuItem[]) => IPublicTypeContextMenuItem[]) {
    adjustMenuLayoutFn = fn;
  }
}