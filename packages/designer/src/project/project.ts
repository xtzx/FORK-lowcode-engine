/**
 * @file Project 项目管理器
 * @description 管理低代码项目的多文档、组件库、国际化等
 *
 * 核心功能：
 * 1. 多文档管理：管理多个页面/组件文档
 * 2. Schema 导入导出：load/getSchema 处理整个项目数据
 * 3. 文档切换：open 切换当前编辑的文档
 * 4. 模拟器集成：mountSimulator 关联渲染器
 * 5. 组件库管理：合并所有文档的 componentsMap
 * 6. 国际化：管理 i18n 配置
 *
 * 项目结构：
 * ```
 * Project
 *   ├─ documents: []           // 所有文档（页面）
 *   │   ├─ document1 (active)  // 当前激活的文档
 *   │   └─ document2
 *   ├─ simulator               // 模拟器（iframe 渲染器）
 *   ├─ componentsMap           // 组件库映射
 *   ├─ i18n                    // 国际化配置
 *   └─ config                  // 项目配置
 * ```
 *
 * 文档生命周期：
 * ```
 * 1. createDocument(schema) - 创建文档
 * 2. open(doc) - 打开文档（设为 active）
 * 3. checkExclusive() - 其他文档挂起（suspense）
 * 4. doc.close() - 关闭文档
 * 5. doc.remove() - 移除文档
 * ```
 *
 * Schema 结构：
 * ```typescript
 * ProjectSchema {
 *   version: '1.0.0',
 *   componentsMap: [              // 组件库
 *     { package: '@ali/button', version: '1.0.0', componentName: 'Button' }
 *   ],
 *   componentsTree: [             // 所有页面
 *     { componentName: 'Page', fileName: 'page1', children: [...] },
 *     { componentName: 'Page', fileName: 'page2', children: [...] }
 *   ],
 *   i18n: { 'zh-CN': {...}, 'en-US': {...} },
 *   config: { layout: {...} }
 * }
 * ```
 *
 * 多文档场景：
 * - 多页面应用：每个页面一个文档
 * - 组件库开发：每个组件一个文档
 * - 低代码 IDE：多个文件同时编辑
 *
 * @example
 * ```typescript
 * // 创建项目
 * const project = new Project(designer, schema);
 *
 * // 加载 Schema
 * project.load(schema, true);  // true: 自动打开第一个文档
 *
 * // 创建新文档
 * const doc = project.createDocument({ componentName: 'Page' });
 *
 * // 打开文档
 * project.open(doc);
 *
 * // 切换文档
 * project.open('page2');  // 按 fileName 打开
 *
 * // 导出 Schema
 * const schema = project.getSchema();
 * ```
 */

import { obx, computed, makeObservable, action, IEventBus, createModuleEventBus } from '@alilc/lowcode-editor-core';
import { IDesigner } from '../designer';
import { DocumentModel, isDocumentModel } from '../document';
import type { IDocumentModel } from '../document';
import { IPublicEnumTransformStage } from '@alilc/lowcode-types';
import type {
  IBaseApiProject,
  IPublicTypeProjectSchema,
  IPublicTypeRootSchema,
  IPublicTypeComponentsMap,
  IPublicTypeSimulatorRenderer,
} from '@alilc/lowcode-types';
import { isLowCodeComponentType, isProCodeComponentType } from '@alilc/lowcode-utils';
import { ISimulatorHost } from '../simulator';

// ==================== IProject 接口 ====================
/**
 * 项目接口
 *
 * 说明：
 * - 继承 IBaseApiProject，提供公共 API
 * - 省略一些方法，使用内部实现
 *
 * 核心属性：
 * - designer: 所属设计器
 * - simulator: 模拟器
 * - currentDocument: 当前文档
 * - documents: 所有文档
 * - i18n: 国际化配置
 *
 * 核心方法：
 * - load/getSchema: 导入导出
 * - open/createDocument: 文档管理
 * - mountSimulator: 模拟器集成
 */
export interface IProject extends Omit<IBaseApiProject<
  IDocumentModel
>,
  'simulatorHost' |
  'importSchema' |
  'exportSchema' |
  'openDocument' |
  'getDocumentById' |
  'getCurrentDocument' |
  'addPropsTransducer' |
  'onRemoveDocument' |
  'onChangeDocument' |
  'onSimulatorHostReady' |
  'onSimulatorRendererReady' |
  'setI18n' |
  'setConfig' |
  'currentDocument' |
  'selection' |
  'documents' |
  'createDocument' |
  'getDocumentByFileName'
> {
  /**
   * 所属设计器
   */
  get designer(): IDesigner;

  /**
   * 模拟器（渲染器）
   */
  get simulator(): ISimulatorHost | null;

  /**
   * 当前激活的文档
   */
  get currentDocument(): IDocumentModel | null | undefined;

  /**
   * 所有文档列表
   */
  get documents(): IDocumentModel[];

  /**
   * 国际化配置
   */
  get i18n(): {
    [local: string]: {
      [key: string]: any;
    };
  };

  /**
   * 挂载模拟器
   */
  mountSimulator(simulator: ISimulatorHost): void;

  /**
   * 打开文档
   *
   * @param doc - 文档（可以是文档对象、文档ID、fileName 或 Schema）
   */
  open(doc?: string | IDocumentModel | IPublicTypeRootSchema): IDocumentModel | null;

  /**
   * 根据文件名获取文档
   */
  getDocumentByFileName(fileName: string): IDocumentModel | null;

  /**
   * 创建新文档
   */
  createDocument(data?: IPublicTypeRootSchema): IDocumentModel;

  /**
   * 加载项目 Schema
   *
   * @param schema - 项目 Schema
   * @param autoOpen - 是否自动打开（true: 打开第一个，string: 打开指定文件）
   */
  load(schema?: IPublicTypeProjectSchema, autoOpen?: boolean | string): void;

  /**
   * 获取项目 Schema
   */
  getSchema(
    stage?: IPublicEnumTransformStage,
  ): IPublicTypeProjectSchema;

  /**
   * 根据 ID 获取文档
   */
  getDocument(id: string): IDocumentModel | null;

  /**
   * 监听当前文档变化
   */
  onCurrentDocumentChange(fn: (doc: IDocumentModel) => void): () => void;

  /**
   * 监听模拟器就绪
   */
  onSimulatorReady(fn: (args: any) => void): () => void;

  /**
   * 监听渲染器就绪
   */
  onRendererReady(fn: () => void): () => void;

  /**
   * 分字段设置储存数据，不记录操作记录
   */
  set<T extends keyof IPublicTypeProjectSchema>(key: T, value: IPublicTypeProjectSchema[T]): void;
  set(key: string, value: unknown): void;

  /**
   * 分字段获取储存数据
   */
  get<T extends keyof IPublicTypeProjectSchema>(key: T): IPublicTypeProjectSchema[T];
  get<T>(key: string): T;
  get(key: string): unknown;

  /**
   * 检查并处理文档互斥（挂起其他文档）
   */
  checkExclusive(activeDoc: DocumentModel): void;

  /**
   * 设置渲染器就绪
   */
  setRendererReady(renderer: IPublicTypeSimulatorRenderer<any, any>): void;
}

// ==================== Project 类 ====================
/**
 * 项目类
 *
 * 职责：
 * - 管理多个文档
 * - 处理 Schema 导入导出
 * - 协调模拟器和文档
 * - 管理项目级配置
 *
 * 核心数据：
 * ```typescript
 * {
 *   documents: [doc1, doc2],      // 所有文档
 *   currentDocument: doc1,        // 当前文档
 *   documentsMap: Map,            // 文档映射
 *   data: ProjectSchema,          // 项目数据
 *   _simulator: ISimulatorHost,   // 模拟器
 *   _config: any,                 // 项目配置
 *   _i18n: any,                   // 国际化
 * }
 * ```
 */
export class Project implements IProject {
  private emitter: IEventBus = createModuleEventBus('Project');

  @obx.shallow readonly documents: IDocumentModel[] = [];

  private data: IPublicTypeProjectSchema = {
    version: '1.0.0',
    componentsMap: [],
    componentsTree: [],
    i18n: {},
  };

  private _simulator?: ISimulatorHost;

  private isRendererReady: boolean = false;

  /**
   * 模拟器
   */
  get simulator(): ISimulatorHost | null {
    return this._simulator || null;
  }

  @computed get currentDocument(): IDocumentModel | null | undefined {
    return this.documents.find((doc) => doc.active);
  }

  @obx private _config: any = {};
  @computed get config(): any {
    // TODO: parse layout Component
    return this._config;
  }
  set config(value: any) {
    this._config = value;
  }

  @obx.ref private _i18n: any = {};
  @computed get i18n(): any {
    return this._i18n;
  }
  set i18n(value: any) {
    this._i18n = value || {};
  }

  private documentsMap = new Map<string, DocumentModel>();

  constructor(readonly designer: IDesigner, schema?: IPublicTypeProjectSchema, readonly viewName = 'global') {
    makeObservable(this);
    this.load(schema);
  }

  private getComponentsMap(): IPublicTypeComponentsMap {
    return this.documents.reduce<IPublicTypeComponentsMap>((
      componentsMap: IPublicTypeComponentsMap,
      curDoc: IDocumentModel,
    ): IPublicTypeComponentsMap => {
      const curComponentsMap = curDoc.getComponentsMap();
      if (Array.isArray(curComponentsMap)) {
        curComponentsMap.forEach((item) => {
          const found = componentsMap.find((eItem) => {
            if (
              isProCodeComponentType(eItem) &&
              isProCodeComponentType(item) &&
              eItem.package === item.package &&
              eItem.componentName === item.componentName
            ) {
              return true;
            } else if (
              isLowCodeComponentType(eItem) &&
              eItem.componentName === item.componentName
            ) {
              return true;
            }
            return false;
          });
          if (found) return;
          componentsMap.push(item);
        });
      }
      return componentsMap;
    }, [] as IPublicTypeComponentsMap);
  }

  /**
   * 获取项目整体 schema
   */
  getSchema(
    stage: IPublicEnumTransformStage = IPublicEnumTransformStage.Save,
  ): IPublicTypeProjectSchema {
    return {
      ...this.data,
      componentsMap: this.getComponentsMap(),
      componentsTree: this.documents
        .filter((doc) => !doc.isBlank())
        .map((doc) => doc.export(stage) || {} as IPublicTypeRootSchema),
      i18n: this.i18n,
    };
  }

  /**
   * 替换当前 document 的 schema，并触发渲染器的 render
   * @param schema
   */
  setSchema(schema?: IPublicTypeProjectSchema) {
    // FIXME: 这里的行为和 getSchema 并不对等，感觉不太对
    const doc = this.documents.find((doc) => doc.active);
    doc && schema?.componentsTree[0] && doc.import(schema?.componentsTree[0]);
    this.simulator?.rerender();
  }

  /**
   * 整体设置项目 schema
   *
   * @param autoOpen true 自动打开文档 string 指定打开的文件
   */
  @action
  load(schema?: IPublicTypeProjectSchema, autoOpen?: boolean | string) {
    this.unload();
    // load new document
    this.data = {
      version: '1.0.0',
      componentsMap: [],
      componentsTree: [],
      i18n: {},
      ...schema,
    };
    this.config = schema?.config || this.config;
    this.i18n = schema?.i18n || this.i18n;

    if (autoOpen) {
      if (autoOpen === true) {
        // auto open first document or open a blank page
        // this.open(this.data.componentsTree[0]);
        const documentInstances = this.data.componentsTree.map((data) => this.createDocument(data));
        // TODO: 暂时先读 config tabBar 里的值，后面看整个 layout 结构是否能作为引擎规范
        if (this.config?.layout?.props?.tabBar?.items?.length > 0) {
          // slice(1) 这个贼不雅，默认任务 fileName 是类'/fileName'的形式
          documentInstances
            .find((i) => i.fileName === this.config.layout.props.tabBar.items[0].path?.slice(1))
            ?.open();
        } else {
          documentInstances[0].open();
        }
      } else {
        // auto open should be string of fileName
        this.open(autoOpen);
      }
    }
  }

  /**
   * 卸载当前项目数据
   */
  unload() {
    if (this.documents.length < 1) {
      return;
    }
    for (let i = this.documents.length - 1; i >= 0; i--) {
      this.documents[i].remove();
    }
  }

  removeDocument(doc: IDocumentModel) {
    const index = this.documents.indexOf(doc);
    if (index < 0) {
      return;
    }
    this.documents.splice(index, 1);
    this.documentsMap.delete(doc.id);
  }

  /**
   * 分字段设置储存数据，不记录操作记录
   */
  set<T extends keyof IPublicTypeProjectSchema>(key: T, value: IPublicTypeProjectSchema[T]): void;
  set(key: string, value: unknown): void;
  set(key: string, value: unknown): void {
    if (key === 'config') {
      this.config = value;
    }
    if (key === 'i18n') {
      this.i18n = value;
    }
    Object.assign(this.data, { [key]: value });
  }

  /**
   * 分字段设置储存数据
   */
  get<T extends keyof IPublicTypeRootSchema>(key: T): IPublicTypeRootSchema[T];
  get<T>(key: string): T;
  get(key: string): unknown;
  get(key: string): any {
    if (key === 'config') {
      return this.config;
    }
    if (key === 'i18n') {
      return this.i18n;
    }
    return Reflect.get(this.data, key);
  }

  getDocument(id: string): IDocumentModel | null {
    // 此处不能使用 this.documentsMap.get(id)，因为在乐高 rollback 场景，document.id 会被改成其他值
    return this.documents.find((doc) => doc.id === id) || null;
  }

  getDocumentByFileName(fileName: string): IDocumentModel | null {
    return this.documents.find((doc) => doc.fileName === fileName) || null;
  }

  @action
  createDocument(data?: IPublicTypeRootSchema): IDocumentModel {
    const doc = new DocumentModel(this, data || this?.data?.componentsTree?.[0]);
    this.documents.push(doc);
    this.documentsMap.set(doc.id, doc);
    return doc;
  }

  open(doc?: string | IDocumentModel | IPublicTypeRootSchema): IDocumentModel | null {
    if (!doc) {
      const got = this.documents.find((item) => item.isBlank());
      if (got) {
        return got.open();
      }
      doc = this.createDocument();
      return doc.open();
    }
    if (typeof doc === 'string' || typeof doc === 'number') {
      const got = this.documents.find((item) => item.fileName === String(doc) || String(item.id) === String(doc));
      if (got) {
        return got.open();
      }

      const data = this.data.componentsTree.find((data) => data.fileName === String(doc));
      if (data) {
        doc = this.createDocument(data);
        return doc.open();
      }

      return null;
    } else if (isDocumentModel(doc)) {
      return doc.open();
    }
    //  else if (isPageSchema(doc)) {
    // 暂时注释掉，影响了 diff 功能
    // const foundDoc = this.documents.find(curDoc => curDoc?.rootNode?.id && curDoc?.rootNode?.id === doc?.id);
    // if (foundDoc) {
    //   foundDoc.remove();
    // }
    // }

    doc = this.createDocument(doc);
    return doc.open();
  }

  checkExclusive(activeDoc: DocumentModel) {
    this.documents.forEach((doc) => {
      if (doc !== activeDoc) {
        doc.suspense();
      }
    });
    this.emitter.emit('current-document.change', activeDoc);
  }

  closeOthers(opened: DocumentModel) {
    this.documents.forEach((doc) => {
      if (doc !== opened) {
        doc.close();
      }
    });
  }

  mountSimulator(simulator: ISimulatorHost) {
    // TODO: 多设备 simulator 支持
    this._simulator = simulator;
    this.emitter.emit('lowcode_engine_simulator_ready', simulator);
  }

  setRendererReady(renderer: any) {
    this.isRendererReady = true;
    this.emitter.emit('lowcode_engine_renderer_ready', renderer);
  }

  onSimulatorReady(fn: (args: any) => void): () => void {
    if (this._simulator) {
      fn(this._simulator);
      return () => {};
    }
    this.emitter.on('lowcode_engine_simulator_ready', fn);
    return () => {
      this.emitter.removeListener('lowcode_engine_simulator_ready', fn);
    };
  }

  onRendererReady(fn: () => void): () => void {
    if (this.isRendererReady) {
      fn();
    }
    this.emitter.on('lowcode_engine_renderer_ready', fn);
    return () => {
      this.emitter.removeListener('lowcode_engine_renderer_ready', fn);
    };
  }

  onCurrentDocumentChange(fn: (doc: IDocumentModel) => void): () => void {
    this.emitter.on('current-document.change', fn);
    return () => {
      this.emitter.removeListener('current-document.change', fn);
    };
  }
}
