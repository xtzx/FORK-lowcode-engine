/**
 * @file ComponentActions 组件动作管理
 * @description 管理组件的通用操作动作（删除、复制、锁定等）
 *
 * 核心功能：
 * 1. 内置动作：提供5个常用的组件操作
 * 2. 动作管理：添加、删除、修改动作
 * 3. 条件显示：根据条件决定是否显示动作
 * 4. 元数据转换：注册元数据转换器
 *
 * 内置动作列表：
 * - remove: 删除节点
 * - copy: 复制节点
 * - hide: 隐藏节点（仅模态框）
 * - lock: 锁定节点
 * - unlock: 解锁节点
 *
 * 使用场景：
 * - 画布右键菜单
 * - 大纲树右键菜单
 * - 工具栏按钮
 *
 * @example
 * ```typescript
 * // 使用内置动作
 * componentActions.actions.forEach(action => {
 *   if (action.condition(node)) {
 *     // 显示动作
 *   }
 * });
 *
 * // 添加自定义动作
 * componentActions.addBuiltinComponentAction({
 *   name: 'custom',
 *   content: {
 *     icon: CustomIcon,
 *     title: '自定义操作',
 *     action: (node) => {
 *       // 自定义逻辑
 *     }
 *   }
 * });
 * ```
 */

import { IPublicModelNode, IPublicTypeComponentAction, IPublicTypeMetadataTransducer } from '@alilc/lowcode-types';
import { engineConfig } from '@alilc/lowcode-editor-core';
import { intlNode } from './locale';
import {
  IconLock,  // 锁定图标
  IconUnlock,  // 解锁图标
  IconRemove,  // 删除图标
  IconClone,  // 复制图标
  IconHidden,  // 隐藏图标
} from './icons';
import { componentDefaults, legacyIssues } from './transducers';  // 元数据转换器

// ==================== 辅助函数：去重 ref 属性 ====================
/**
 * 递归去重节点的 ref 属性
 *
 * @param node - 节点
 *
 * 功能：
 * - 检查节点是否有 ref 属性
 * - 如果有，生成新的唯一 ref
 * - 递归处理所有子节点
 *
 * 为什么需要去重？
 * - 复制节点时，ref 会重复
 * - ref 应该是唯一的
 * - 避免 React 引用冲突
 *
 * ref 生成规则：
 * ```typescript
 * // 格式：{组件名小写}-{随机字符串}
 * button-a1b2c3d
 * input-x9y8z7w
 * ```
 *
 * 使用场景：
 * ```typescript
 * // 复制节点后
 * const newNode = document.insertNode(parent, node, index, true);
 * deduplicateRef(newNode);  // 去重 ref
 * ```
 */
function deduplicateRef(node: IPublicModelNode | null | undefined) {
  // 获取当前 ref
  const currentRef = node?.getPropValue('ref');

  if (currentRef) {
    // 有 ref，生成新的唯一 ref
    // 格式：{组件名}-{随机ID}
    node?.setPropValue('ref', `${node.componentName.toLowerCase()}-${Math.random().toString(36).slice(2, 9)}`);
  }

  // 递归处理子节点
  node?.children?.forEach(deduplicateRef);
}

export class ComponentActions {
  private metadataTransducers: IPublicTypeMetadataTransducer[] = [];

  actions: IPublicTypeComponentAction[] = [
    {
      name: 'remove',
      content: {
        icon: IconRemove,
        title: intlNode('remove'),
        /* istanbul ignore next */
        action(node: IPublicModelNode) {
          node.remove();
        },
      },
      important: true,
    },
    {
      name: 'hide',
      content: {
        icon: IconHidden,
        title: intlNode('hide'),
        /* istanbul ignore next */
        action(node: IPublicModelNode) {
          node.visible = false;
        },
      },
      /* istanbul ignore next */
      condition: (node: IPublicModelNode) => {
        return node.componentMeta?.isModal;
      },
      important: true,
    },
    {
      name: 'copy',
      content: {
        icon: IconClone,
        title: intlNode('copy'),
        /* istanbul ignore next */
        action(node: IPublicModelNode) {
          // node.remove();
          const { document: doc, parent, index } = node;
          if (parent) {
            const newNode = doc?.insertNode(parent, node, (index ?? 0) + 1, true);
            deduplicateRef(newNode);
            newNode?.select();
            const { isRGL, rglNode } = node?.getRGL();
            if (isRGL) {
              // 复制 layout 信息
              const layout: any = rglNode?.getPropValue('layout') || [];
              const curLayout = layout.filter((item: any) => item.i === node.getPropValue('fieldId'));
              if (curLayout && curLayout[0]) {
                layout.push({
                  ...curLayout[0],
                  i: newNode?.getPropValue('fieldId'),
                });
                rglNode?.setPropValue('layout', layout);
                // 如果是磁贴块复制，则需要滚动到影响位置
                setTimeout(() => newNode?.document?.project?.simulatorHost?.scrollToNode(newNode), 10);
              }
            }
          }
        },
      },
      important: true,
    },
    {
      name: 'lock',
      content: {
        icon: IconLock, // 锁定 icon
        title: intlNode('lock'),
        /* istanbul ignore next */
        action(node: IPublicModelNode) {
          node.lock();
        },
      },
      /* istanbul ignore next */
      condition: (node: IPublicModelNode) => {
        return engineConfig.get('enableCanvasLock', false) && node.isContainerNode && !node.isLocked;
      },
      important: true,
    },
    {
      name: 'unlock',
      content: {
        icon: IconUnlock, // 解锁 icon
        title: intlNode('unlock'),
        /* istanbul ignore next */
        action(node: IPublicModelNode) {
          node.lock(false);
        },
      },
      /* istanbul ignore next */
      condition: (node: IPublicModelNode) => {
        return engineConfig.get('enableCanvasLock', false) && node.isContainerNode && node.isLocked;
      },
      important: true,
    },
  ];

  constructor() {
    this.registerMetadataTransducer(legacyIssues, 2, 'legacy-issues'); // should use a high level priority, eg: 2
    this.registerMetadataTransducer(componentDefaults, 100, 'component-defaults');
  }

  removeBuiltinComponentAction(name: string) {
    const i = this.actions.findIndex((action) => action.name === name);
    if (i > -1) {
      this.actions.splice(i, 1);
    }
  }
  addBuiltinComponentAction(action: IPublicTypeComponentAction) {
    this.actions.push(action);
  }

  modifyBuiltinComponentAction(
    actionName: string,
    handle: (action: IPublicTypeComponentAction) => void,
  ) {
    const builtinAction = this.actions.find((action) => action.name === actionName);
    if (builtinAction) {
      handle(builtinAction);
    }
  }

  registerMetadataTransducer(
    transducer: IPublicTypeMetadataTransducer,
    level = 100,
    id?: string,
  ) {
    transducer.level = level;
    transducer.id = id;
    const i = this.metadataTransducers.findIndex((item) => item.level != null && item.level > level);
    if (i < 0) {
      this.metadataTransducers.push(transducer);
    } else {
      this.metadataTransducers.splice(i, 0, transducer);
    }
  }

  getRegisteredMetadataTransducers(): IPublicTypeMetadataTransducer[] {
    return this.metadataTransducers;
  }
}