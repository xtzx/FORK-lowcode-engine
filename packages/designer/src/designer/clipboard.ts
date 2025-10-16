/**
 * @file Clipboard 剪贴板管理
 * @description 处理复制粘贴操作，支持跨文档和 iframe
 *
 * 核心功能：
 * 1. 复制：setData() 复制节点到剪贴板
 * 2. 粘贴：waitPasteData() 等待粘贴事件
 * 3. 跨文档：支持多个 iframe 的复制粘贴
 * 4. 隐藏输入框：使用隐藏的 textarea 实现
 *
 * 实现原理：
 * ```
 * 1. 在每个 document 中创建隐藏的 textarea
 * 2. 复制时：将数据写入 textarea，执行 copy 命令
 * 3. 粘贴时：聚焦 textarea，等待 paste 事件
 * 4. 获取剪贴板数据，解析并返回
 * ```
 *
 * 为什么用 textarea？
 * - 浏览器限制：只能通过 input/textarea 访问剪贴板
 * - 使用隐藏的 textarea 作为桥梁
 * - 用户无感知
 *
 * @example
 * ```typescript
 * // 复制节点
 * clipboard.setData({
 *   componentsTree: [node.export()]
 * });
 *
 * // 等待粘贴
 * clipboard.waitPasteData(event, (data) => {
 *   console.log('粘贴的数据：', data);
 * });
 * ```
 */

import { IPublicModelClipboard } from '@alilc/lowcode-types';

// ==================== 辅助函数：从粘贴事件获取数据 ====================
/**
 * 从粘贴事件中提取数据
 *
 * @param event - 粘贴事件
 * @returns 解析后的数据或 null
 *
 * 数据格式：
 * ```typescript
 * // 完整格式：
 * {
 *   componentsMap: {...},
 *   componentsTree: [...]
 * }
 *
 * // 简化格式（单个节点）：
 * {
 *   componentName: 'Button',
 *   props: {...}
 * }
 * // 自动包装为：
 * {
 *   componentsTree: [{ componentName: 'Button', ... }]
 * }
 * ```
 *
 * 异常处理：
 * - JSON 解析失败：返回空对象
 * - 无 clipboardData：返回 null
 * - TODO: 未来可能支持更复杂的解析
 */
function getDataFromPasteEvent(event: ClipboardEvent) {
  // 获取剪贴板数据
  const { clipboardData } = event;
  if (!clipboardData) {
    return null;
  }

  try {
    // 解析 JSON 数据
    // 格式：{ componentsMap, componentsTree, ... }
    const data = JSON.parse(clipboardData.getData('text/plain'));

    if (!data) {
      return {};
    }

    // 完整格式：有 componentsTree
    if (data.componentsTree) {
      return data;
    }
    // 简化格式：单个节点
    else if (data.componentName) {
      // 包装为标准格式
      return {
        componentsTree: [data],
      };
    }
  } catch (error) {
    // JSON 解析失败
    // TODO: open the parser implement
    // 未来可能支持更复杂的解析（如 HTML、纯文本等）
    return { };
  }
}

// ==================== IClipboard 接口 ====================
/**
 * 剪贴板接口
 *
 * 继承：IPublicModelClipboard
 *
 * 扩展方法：
 * - initCopyPaster: 初始化粘贴区域
 * - injectCopyPaster: 注入粘贴区域到文档
 */
export interface IClipboard extends IPublicModelClipboard {
  /**
   * 初始化粘贴区域
   *
   * @param el - textarea 元素
   *
   * 功能：
   * - 注册 paste 事件监听
   * - 返回清理函数
   */
  initCopyPaster(el: HTMLTextAreaElement): void;

  /**
   * 注入粘贴区域到文档
   *
   * @param document - 目标文档
   *
   * 功能：
   * - 创建隐藏的 textarea
   * - 添加到 document.body
   * - 初始化事件监听
   */
  injectCopyPaster(document: Document): void;
}

// ==================== Clipboard 类 ====================
/**
 * 剪贴板类
 *
 * 职责：
 * - 管理多个 copyPaster（textarea）
 * - 处理复制粘贴事件
 * - 支持跨文档操作
 *
 * 核心数据：
 * - copyPasters: 所有 textarea 的数组
 * - waitFn: 等待粘贴的回调函数
 */
class Clipboard implements IClipboard {
  private copyPasters: HTMLTextAreaElement[] = [];

  private waitFn?: (data: any, e: ClipboardEvent) => void;

  constructor() {
    this.injectCopyPaster(document);
  }

  isCopyPasteEvent(e: Event) {
    this.isCopyPaster(e.target);
  }

  private isCopyPaster(el: any) {
    return this.copyPasters.includes(el);
  }

  initCopyPaster(el: HTMLTextAreaElement) {
    this.copyPasters.push(el);
    const onPaste = (e: ClipboardEvent) => {
      if (this.waitFn) {
        this.waitFn(getDataFromPasteEvent(e), e);
        this.waitFn = undefined;
      }
      el.blur();
    };
    el.addEventListener('paste', onPaste, false);
    return () => {
      el.removeEventListener('paste', onPaste, false);
      const i = this.copyPasters.indexOf(el);
      if (i > -1) {
        this.copyPasters.splice(i, 1);
      }
    };
  }

  injectCopyPaster(document: Document) {
    if (this.copyPasters.find((x) => x.ownerDocument === document)) {
      return;
    }
    const copyPaster = document.createElement<'textarea'>('textarea');
    copyPaster.style.cssText = 'position: absolute;left: -9999px;top:-100px';
    if (document.body) {
      document.body.appendChild(copyPaster);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(copyPaster);
      });
    }
    const dispose = this.initCopyPaster(copyPaster);
    return () => {
      dispose();
      document.removeChild(copyPaster);
    };
  }

  setData(data: any): void {
    const copyPaster = this.copyPasters.find((x) => x.ownerDocument);
    if (!copyPaster) {
      return;
    }
    copyPaster.value = typeof data === 'string' ? data : JSON.stringify(data);
    copyPaster.select();
    copyPaster.ownerDocument!.execCommand('copy');

    copyPaster.blur();
  }

  waitPasteData(keyboardEvent: KeyboardEvent, cb: (data: any, e: ClipboardEvent) => void) {
    const win = keyboardEvent.view;
    if (!win) {
      return;
    }
    const copyPaster = this.copyPasters.find((cp) => cp.ownerDocument === win.document);
    if (copyPaster) {
      copyPaster.select();
      this.waitFn = cb;
    }
  }
}

export const clipboard = new Clipboard();
