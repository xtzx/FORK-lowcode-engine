/**
 * @file DropLocation 拖放位置管理
 * @description 管理拖拽过程中的目标位置信息
 *
 * 核心功能：
 * 1. 位置表示：target + detail 描述插入位置
 * 2. 位置判断：是否是容器、是否垂直布局等
 * 3. 位置克隆：创建位置副本
 * 4. 兼容接口：提供兼容旧版本的方法
 *
 * 位置结构：
 * ```typescript
 * DropLocation {
 *   target: Node,        // 目标容器节点
 *   detail: {            // 详细位置信息
 *     type: 'Children',  // 位置类型
 *     index: 2,          // 插入索引
 *     valid: true        // 是否有效
 *   },
 *   event: LocateEvent,  // 触发事件
 *   source: 'canvas'     // 来源（canvas、tree等）
 * }
 * ```
 *
 * 使用场景：
 * - 拖拽时显示插入线
 * - 计算插入位置
 * - 执行节点插入
 *
 * @example
 * ```typescript
 * // 创建位置
 * const location = new DropLocation({
 *   target: containerNode,
 *   detail: { type: 'Children', index: 2 },
 *   source: 'canvas',
 *   event: locateEvent
 * });
 *
 * // 使用位置
 * location.target.insertChild(dragNode, location.detail.index);
 * ```
 */

import type { IDocumentModel, INode } from '../document';
import { ILocateEvent } from './dragon';
import {
  IPublicModelDropLocation,  // 拖放位置模型接口
  IPublicTypeLocationDetailType,  // 位置详情类型枚举
  IPublicTypeRect,  // 矩形类型
  IPublicTypeLocationDetail,  // 位置详情类型
  IPublicTypeLocationData,  // 位置数据类型
  IPublicModelLocateEvent,  // 定位事件模型
} from '@alilc/lowcode-types';

// ==================== Point 接口 ====================
/**
 * 点坐标接口（客户端坐标）
 *
 * 说明：
 * - clientX/Y: 相对于浏览器视口的坐标
 * - 用于鼠标事件
 */
export interface Point {
  clientX: number;  // X 坐标
  clientY: number;  // Y 坐标
}

// ==================== CanvasPoint 接口 ====================
/**
 * 画布点坐标接口
 *
 * 说明：
 * - canvasX/Y: 相对于画布的坐标
 * - 考虑了画布的缩放和偏移
 */
export interface CanvasPoint {
  canvasX: number;  // 画布 X 坐标
  canvasY: number;  // 画布 Y 坐标
}

// ==================== Rects 类型 ====================
/**
 * 矩形数组类型（带元素引用）
 *
 * 扩展：
 * - elements: 对应的 DOM 元素数组
 *
 * 用途：
 * - 节点可能有多个 DOM 元素（Fragment）
 * - 需要同时返回矩形和元素
 */
export type Rects = DOMRect[] & {
  elements: Array<Element | Text>;  // 对应的 DOM 元素
};

// ==================== 类型守卫函数（废弃）====================
/**
 * 判断是否是位置数据
 *
 * @deprecated 已废弃，使用 @alilc/lowcode-utils 中的同名函数
 */
export function isLocationData(obj: any): boolean {
  return obj && obj.target && obj.detail;
}

/**
 * 判断是否是 Children 类型的位置详情
 *
 * @deprecated 已废弃，使用 @alilc/lowcode-utils 中的同名函数
 */
export function isLocationChildrenDetail(obj: any): boolean {
  return obj && obj.type === IPublicTypeLocationDetailType.Children;
}

export function isRowContainer(container: Element | Text, win?: Window) {
  if (isText(container)) {
    return true;
  }
  const style = (win || getWindow(container)).getComputedStyle(container);
  const display = style.getPropertyValue('display');
  if (/flex$/.test(display)) {
    const direction = style.getPropertyValue('flex-direction') || 'row';
    if (direction === 'row' || direction === 'row-reverse') {
      return true;
    }
  }
  if (/grid$/.test(display)) {
    return true;
  }
  return false;
}

export function isChildInline(child: Element | Text, win?: Window) {
  if (isText(child)) {
    return true;
  }
  const style = (win || getWindow(child)).getComputedStyle(child);
  return /^inline/.test(style.getPropertyValue('display')) || /^(left|right)$/.test(style.getPropertyValue('float'));
}

export function getRectTarget(rect: IPublicTypeRect | null) {
  if (!rect || rect.computed) {
    return null;
  }
  const els = rect.elements;
  return els && els.length > 0 ? els[0]! : null;
}

export function isVerticalContainer(rect: IPublicTypeRect | null) {
  const el = getRectTarget(rect);
  if (!el) {
    return false;
  }
  return isRowContainer(el);
}

export function isVertical(rect: IPublicTypeRect | null) {
  const el = getRectTarget(rect);
  if (!el) {
    return false;
  }
  return isChildInline(el) || (el.parentElement ? isRowContainer(el.parentElement) : false);
}

function isText(elem: any): elem is Text {
  return elem.nodeType === Node.TEXT_NODE;
}

function isDocument(elem: any): elem is Document {
  return elem.nodeType === Node.DOCUMENT_NODE;
}

export function getWindow(elem: Element | Document): Window {
  return (isDocument(elem) ? elem : elem.ownerDocument!).defaultView!;
}
export interface IDropLocation extends Omit<IPublicModelDropLocation, 'target' | 'clone'> {

  readonly source: string;

  get target(): INode;

  get document(): IDocumentModel | null;

  clone(event: IPublicModelLocateEvent): IDropLocation;
}

export class DropLocation implements IDropLocation {
  readonly target: INode;

  readonly detail: IPublicTypeLocationDetail;

  readonly event: ILocateEvent;

  readonly source: string;

  get document(): IDocumentModel | null {
    return this.target.document;
  }

  constructor({ target, detail, source, event }: IPublicTypeLocationData<INode>) {
    this.target = target;
    this.detail = detail;
    this.source = source;
    this.event = event;
  }

  clone(event: ILocateEvent): IDropLocation {
    return new DropLocation({
      target: this.target,
      detail: this.detail,
      source: this.source,
      event,
    });
  }

  /**
   * @deprecated
   * 兼容 vision
   */
  getContainer() {
    return this.target;
  }

  /**
   * @deprecated
   * 兼容 vision
   */
  getInsertion() {
    if (!this.detail) {
      return null;
    }
    if (this.detail.type === 'Children') {
      if (this.detail.index <= 0) {
        return null;
      }
      return this.target.children?.get(this.detail.index - 1);
    }
    return (this.detail as any)?.near?.node;
  }
}
