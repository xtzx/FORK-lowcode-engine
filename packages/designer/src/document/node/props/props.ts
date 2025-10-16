/**
 * @file Props 属性集合管理
 * @description 管理节点的所有属性，支持 Map 和 List 两种类型
 *
 * 核心功能：
 * 1. 属性存储：存储节点的所有属性（Map 或 List）
 * 2. 属性访问：get/set/delete 属性
 * 3. 属性导入导出：import/export 属性
 * 4. ExtraProp：管理特殊属性（以 ___ 开头和结尾）
 * 5. 嵌套属性：支持路径访问（'a.b.c'）
 *
 * 两种类型：
 * ```typescript
 * // Map 类型（对象）：
 * {
 *   props: {
 *     name: 'Button',
 *     type: 'primary'
 *   }
 * }
 *
 * // List 类型（数组）：
 * {
 *   props: [
 *     { name: 'children', value: 'Click' },
 *     { spread: true, value: '...rest' }
 *   ]
 * }
 * ```
 *
 * ExtraProp 机制：
 * - 用于存储特殊属性（不在 props 中，但需要保存的）
 * - 格式：___key___ 或 ___key___nested.path
 * - 例如：___condition___ 存储条件渲染配置
 *
 * 使用场景：
 * - 组件属性管理
 * - 属性面板编辑
 * - Schema 导入导出
 *
 * @example
 * ```typescript
 * // 创建 Props
 * const props = new Props(node, {
 *   name: 'Button',
 *   type: 'primary'
 * });
 *
 * // 访问属性
 * props.getPropValue('name')  // 'Button'
 *
 * // 设置属性
 * props.setPropValue('type', 'default');
 *
 * // 嵌套属性
 * props.setPropValue('style.color', 'red');
 *
 * // ExtraProp
 * props.setPropValue('___condition___', { type: 'JSExpression', value: 'state.show' });
 * ```
 */

import { computed, makeObservable, obx, action } from '@alilc/lowcode-editor-core';
import { IPublicTypePropsList, IPublicTypeCompositeValue, IPublicEnumTransformStage, IBaseModelProps } from '@alilc/lowcode-types';
import type { IPublicTypePropsMap } from '@alilc/lowcode-types';
import { uniqueId, compatStage } from '@alilc/lowcode-utils';
import { Prop, UNSET } from './prop';
import type { IProp } from './prop';
import { INode } from '../node';
// import { TransformStage } from '../transform-stage';

// ==================== ExtrasObject 接口 ====================
/**
 * 扩展属性对象
 *
 * 说明：
 * - 存储 ExtraProp（以 ___ 开头和结尾的属性）
 * - 在 export 时分离出来
 */
interface ExtrasObject {
  [key: string]: any;
}

// ==================== ExtraProp 键名转换 ====================
/**
 * ExtraProp 键名前缀
 *
 * 说明：
 * - 用于标识 ExtraProp
 * - 格式：___key___ 或 ___key___nested.path
 */
export const EXTRA_KEY_PREFIX = '___';

/**
 * 将普通键名转换为 ExtraProp 键名
 *
 * @param key - 原始键名（可能包含 . 路径）
 * @returns ExtraProp 键名
 *
 * 转换规则：
 * ```
 * 'condition'         -> '___condition___'
 * 'condition.type'    -> '___condition___.type'
 * 'style.color'       -> '___style___.color'
 * ```
 *
 * 实现：
 * 1. 提取第一部分（. 之前）
 * 2. 添加前后缀：___key___
 * 3. 拼接剩余部分
 */
export function getConvertedExtraKey(key: string): string {
  if (!key) {
    return '';
  }
  let _key = key;
  // 提取第一部分
  if (key.indexOf('.') > 0) {
    _key = key.split('.')[0];
  }
  // ___key___ + 剩余部分
  return EXTRA_KEY_PREFIX + _key + EXTRA_KEY_PREFIX + key.slice(_key.length);
}

/**
 * 将 ExtraProp 键名还原为普通键名
 *
 * @param key - ExtraProp 键名
 * @returns 原始键名
 *
 * 转换规则：
 * ```
 * '___condition___'      -> 'condition'
 * '___condition___.type' -> 'condition.type'
 * ```
 */
export function getOriginalExtraKey(key: string): string {
  return key.replace(new RegExp(`${EXTRA_KEY_PREFIX}`, 'g'), '');
}

// ==================== IPropParent 接口 ====================
/**
 * 属性父级接口
 *
 * 说明：
 * - Props 和 Prop 都可以作为父级
 * - 用于嵌套属性的父子关系
 */
export interface IPropParent {
  /**
   * 根 Props
   */
  readonly props: IProps;

  /**
   * 所属节点
   */
  readonly owner: INode;

  /**
   * 路径（从根 Props 开始）
   */
  get path(): string[];

  /**
   * 删除子属性
   */
  delete(prop: IProp): void;
}

// ==================== IProps 接口 ====================
/**
 * 属性集合接口
 *
 * 继承：
 * - IBaseModelProps: 公共接口
 * - IPropParent: 父级接口
 *
 * 核心方法：
 * - get/query: 获取属性（支持路径）
 * - export/import: 导入导出
 * - merge: 合并属性
 * - purge: 销毁
 */
export interface IProps extends Omit<IBaseModelProps<IProp>, | 'getExtraProp' | 'getExtraPropValue' | 'setExtraPropValue' | 'node'>, IPropParent {

  /**
   * 获取 props 对应的 node
   */
  getNode(): INode;

  /**
   * 获取属性
   *
   * @param path - 属性路径（支持 . 分隔）
   * @param createIfNone - 不存在时是否创建
   */
  get(path: string, createIfNone?: boolean): IProp | null;

  /**
   * 导出属性
   *
   * @param stage - 导出阶段
   * @returns { props, extras }
   */
  export(stage?: IPublicEnumTransformStage): {
    props?: IPublicTypePropsMap | IPublicTypePropsList;
    extras?: ExtrasObject;
  };

  /**
   * 合并属性
   *
   * @param value - 普通属性
   * @param extras - 扩展属性
   */
  merge(value: IPublicTypePropsMap, extras?: IPublicTypePropsMap): void;

  /**
   * 销毁
   */
  purge(): void;

  /**
   * 查询属性（同 get）
   */
  query(path: string, createIfNone: boolean): IProp | null;

  /**
   * 导入属性
   *
   * @param value - 普通属性（Map 或 List）
   * @param extras - 扩展属性
   */
  import(value?: IPublicTypePropsMap | IPublicTypePropsList | null, extras?: ExtrasObject): void;
}

// ==================== Props 类 ====================
/**
 * 属性集合类
 *
 * 职责：
 * - 存储所有属性（items 数组）
 * - 提供访问接口（get/set/delete）
 * - 处理导入导出（import/export）
 * - 管理 ExtraProp（特殊属性）
 *
 * 核心数据结构：
 * ```typescript
 * {
 *   items: [                    // 所有属性
 *     Prop { key: 'name', value: 'Button' },
 *     Prop { key: 'type', value: 'primary' },
 *     Prop { key: '___condition___', value: {...} }  // ExtraProp
 *   ],
 *   type: 'map' | 'list',       // 类型
 *   maps: Map<string, Prop>     // 快速查找（computed）
 * }
 * ```
 *
 * 为什么用 items 数组？
 * - 保持顺序：属性顺序可能影响渲染
 * - 统一处理：Map 和 List 都用数组存储
 * - MobX 友好：数组的响应式性能更好
 *
 * maps 计算属性：
 * - 从 items 构建 Map
 * - 用于快速查找（O(1)）
 * - 自动更新（computed）
 */
export class Props implements IProps, IPropParent {
  readonly id = uniqueId('props');

  @obx.shallow private items: IProp[] = [];

  @computed private get maps(): Map<string, Prop> {
    const maps = new Map();
    if (this.items.length > 0) {
      this.items.forEach((prop) => {
        if (prop.key) {
          maps.set(prop.key, prop);
        }
      });
    }
    return maps;
  }

  readonly path = [];

  get props(): IProps {
    return this;
  }

  readonly owner: INode;

  /**
   * 元素个数
   */
  @computed get size() {
    return this.items.length;
  }

  @obx type: 'map' | 'list' = 'map';

  private purged = false;

  constructor(owner: INode, value?: IPublicTypePropsMap | IPublicTypePropsList | null, extras?: ExtrasObject) {
    makeObservable(this);
    this.owner = owner;
    if (Array.isArray(value)) {
      this.type = 'list';
      this.items = value.map(
        (item, idx) => new Prop(this, item.value, item.name || idx, item.spread),
      );
    } else if (value != null) {
      this.items = Object.keys(value).map((key) => new Prop(this, value[key], key, false));
    }
    if (extras) {
      Object.keys(extras).forEach((key) => {
        this.items.push(new Prop(this, (extras as any)[key], getConvertedExtraKey(key)));
      });
    }
  }

  @action
  import(value?: IPublicTypePropsMap | IPublicTypePropsList | null, extras?: ExtrasObject) {
    const originItems = this.items;
    if (Array.isArray(value)) {
      this.type = 'list';
      this.items = value.map(
        (item, idx) => new Prop(this, item.value, item.name || idx, item.spread),
      );
    } else if (value != null) {
      this.type = 'map';
      this.items = Object.keys(value).map((key) => new Prop(this, value[key], key));
    } else {
      this.type = 'map';
      this.items = [];
    }
    if (extras) {
      Object.keys(extras).forEach((key) => {
        this.items.push(new Prop(this, (extras as any)[key], getConvertedExtraKey(key)));
      });
    }
    originItems.forEach((item) => item.purge());
  }

  @action
  merge(value: IPublicTypePropsMap, extras?: IPublicTypePropsMap) {
    Object.keys(value).forEach((key) => {
      this.query(key, true)!.setValue(value[key]);
      this.query(key, true)!.setupItems();
    });
    if (extras) {
      Object.keys(extras).forEach((key) => {
        this.query(getConvertedExtraKey(key), true)!.setValue(extras[key]);
        this.query(getConvertedExtraKey(key), true)!.setupItems();
      });
    }
  }

  export(stage: IPublicEnumTransformStage = IPublicEnumTransformStage.Save): {
    props?: IPublicTypePropsMap | IPublicTypePropsList;
    extras?: ExtrasObject;
  } {
    stage = compatStage(stage);
    if (this.items.length < 1) {
      return {};
    }
    let allProps = {} as any;
    let props: any = {};
    const extras: any = {};
    if (this.type === 'list') {
      props = [];
      this.items.forEach((item) => {
        let value = item.export(stage);
        let name = item.key as string;
        if (name && typeof name === 'string' && name.startsWith(EXTRA_KEY_PREFIX)) {
          name = getOriginalExtraKey(name);
          extras[name] = value;
        } else {
          props.push({
            spread: item.spread,
            name,
            value,
          });
        }
      });
    } else {
      this.items.forEach((item) => {
        let name = item.key as string;
        if (name == null || item.isUnset() || item.isVirtual()) return;
        let value = item.export(stage);
        if (value != null) {
          allProps[name] = value;
        }
      });
      // compatible vision
      const transformedProps = this.transformToStatic(allProps);
      Object.keys(transformedProps).forEach((name) => {
        const value = transformedProps[name];
        if (typeof name === 'string' && name.startsWith(EXTRA_KEY_PREFIX)) {
          name = getOriginalExtraKey(name);
          extras[name] = value;
        } else {
          props[name] = value;
        }
      });
    }

    return { props, extras };
  }

  /**
   * @deprecated
   */
  /* istanbul ignore next */
  private transformToStatic(props: any) {
    let transducers = this.owner.componentMeta?.prototype?.options?.transducers;
    if (!transducers) {
      return props;
    }
    if (!Array.isArray(transducers)) {
      transducers = [transducers];
    }
    props = transducers.reduce((xprops: any, transducer: any) => {
      if (transducer && typeof transducer.toStatic === 'function') {
        return transducer.toStatic(xprops);
      }
      return xprops;
    }, props);
    return props;
  }

  /**
   * 根据 path 路径查询属性
   *
   * @param createIfNone 当没有的时候，是否创建一个
   */
  @action
  query(path: string, createIfNone = true): IProp | null {
    return this.get(path, createIfNone);
  }

  /**
   * 获取某个属性，如果不存在，临时获取一个待写入
   * @param createIfNone 当没有的时候，是否创建一个
   */
  @action
  get(path: string, createIfNone = false): IProp | null {
    let entry = path;
    let nest = '';
    const i = path.indexOf('.');
    if (i > 0) {
      nest = path.slice(i + 1);
      if (nest) {
        entry = path.slice(0, i);
      }
    }

    let prop = this.maps.get(entry);
    if (!prop && createIfNone) {
      prop = new Prop(this, UNSET, entry);
      this.items.push(prop);
    }

    if (prop) {
      return nest ? prop.get(nest, createIfNone) : prop;
    }

    return null;
  }

  /**
   * 删除项
   */
  @action
  delete(prop: IProp): void {
    const i = this.items.indexOf(prop);
    if (i > -1) {
      this.items.splice(i, 1);
      prop.purge();
    }
  }

  /**
   * 删除 key
   */
  @action
  deleteKey(key: string): void {
    this.items = this.items.filter((item, i) => {
      if (item.key === key) {
        item.purge();
        this.items.splice(i, 1);
        return false;
      }
      return true;
    });
  }

  /**
   * 添加值
   */
  @action
  add(
    value: IPublicTypeCompositeValue | null,
    key?: string | number,
    spread = false,
    options: any = {},
  ): IProp {
    const prop = new Prop(this, value, key, spread, options);
    this.items.push(prop);
    return prop;
  }

  /**
   * 是否存在 key
   */
  has(key: string): boolean {
    return this.maps.has(key);
  }

  /**
   * 迭代器
   */
  [Symbol.iterator](): { next(): { value: IProp } } {
    let index = 0;
    const { items } = this;
    const length = items.length || 0;
    return {
      next() {
        if (index < length) {
          return {
            value: items[index++],
            done: false,
          };
        }
        return {
          value: undefined as any,
          done: true,
        };
      },
    };
  }

  /**
   * 遍历
   */
  @action
  forEach(fn: (item: IProp, key: number | string | undefined) => void): void {
    this.items.forEach((item) => {
      return fn(item, item.key);
    });
  }

  /**
   * 遍历
   */
  @action
  map<T>(fn: (item: IProp, key: number | string | undefined) => T): T[] | null {
    return this.items.map((item) => {
      return fn(item, item.key);
    });
  }

  @action
  filter(fn: (item: IProp, key: number | string | undefined) => boolean) {
    return this.items.filter((item) => {
      return fn(item, item.key);
    });
  }

  /**
   * 回收销毁
   */
  @action
  purge() {
    if (this.purged) {
      return;
    }
    this.purged = true;
    this.items.forEach((item) => item.purge());
  }

  /**
   * 获取某个属性, 如果不存在，临时获取一个待写入
   * @param createIfNone 当没有的时候，是否创建一个
   */
  @action
  getProp(path: string, createIfNone = true): IProp | null {
    return this.query(path, createIfNone) || null;
  }

  /**
   * 获取单个属性值
   */
  @action
  getPropValue(path: string): any {
    return this.getProp(path, false)?.value;
  }

  /**
   * 设置单个属性值
   */
  @action
  setPropValue(path: string, value: any) {
    this.getProp(path, true)!.setValue(value);
  }

  /**
   * 获取 props 对应的 node
   */
  getNode() {
    return this.owner;
  }

  /**
   * @deprecated
   * 获取 props 对应的 node
   */
  @action
  toData() {
    return this.export()?.props;
  }
}
