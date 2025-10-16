/**
 * @file LowCodePluginManager 插件管理器
 * @description 管理低代码引擎的所有插件，负责注册、初始化、销毁等生命周期
 *
 * 核心功能：
 * 1. 插件注册：register() 注册插件
 * 2. 依赖排序：使用 sequencify 根据依赖关系排序
 * 3. 生命周期：init/destroy 管理插件生命周期
 * 4. 版本检查：检查引擎版本兼容性
 * 5. 上下文管理：为每个插件创建独立的上下文
 * 6. 偏好设置：管理插件的配置偏好
 *
 * 插件系统架构：
 * ```
 * PluginManager                // 管理器
 *   ├─ plugins: []             // 所有插件（按注册顺序）
 *   ├─ pluginsMap: Map         // 插件映射（按名称快速查找）
 *   ├─ pluginContextMap: Map   // 插件上下文映射
 *   └─ pluginPreference: Map   // 插件偏好设置
 * ```
 *
 * 插件注册流程：
 * ```
 * 1. 调用 register(pluginModel, options)
 * 2. 检查插件名称是否冲突
 * 3. 检查引擎版本兼容性
 * 4. 创建插件上下文 LowCodePluginContext
 * 5. 执行插件函数，获取配置
 * 6. 创建 LowCodePluginRuntime 实例
 * 7. 存储到 plugins 和 pluginsMap
 * ```
 *
 * 插件初始化流程：
 * ```
 * 1. 调用 init(pluginPreference)
 * 2. 使用 sequencify 根据依赖关系排序
 * 3. 按顺序初始化每个插件
 * 4. 捕获错误，避免影响其他插件
 * ```
 *
 * 依赖关系示例：
 * ```typescript
 * // 插件 A 依赖插件 B
 * const pluginA = {
 *   pluginName: 'A',
 *   meta: {
 *     dependencies: ['B']
 *   },
 *   init() { }
 * };
 *
 * // 初始化顺序：B -> A
 * ```
 *
 * @example
 * ```typescript
 * // 创建管理器
 * const manager = new LowCodePluginManager(contextApiAssembler);
 *
 * // 注册插件
 * await manager.register(pluginModel, options);
 *
 * // 初始化所有插件
 * await manager.init(pluginPreference);
 *
 * // 获取插件
 * const plugin = manager.get('pluginName');
 *
 * // 销毁所有插件
 * await manager.destroy();
 * ```
 */

import { engineConfig } from '@alilc/lowcode-editor-core';
import { getLogger } from '@alilc/lowcode-utils';
import {
  ILowCodePluginRuntime,
  ILowCodePluginManager,
  IPluginContextOptions,
  PluginPreference,
  ILowCodePluginContextApiAssembler,
} from './plugin-types';
import { filterValidOptions, isLowCodeRegisterOptions } from './plugin-utils';
import { LowCodePluginRuntime } from './plugin';
// eslint-disable-next-line import/no-named-as-default
import LowCodePluginContext from './plugin-context';
import { invariant } from '../utils';
import sequencify from './sequencify';
import semverSatisfies from 'semver/functions/satisfies';
import {
  IPublicTypePluginRegisterOptions,
  IPublicTypePreferenceValueType,
  IPublicTypePlugin,
} from '@alilc/lowcode-types';

const logger = getLogger({ level: 'warn', bizName: 'designer:pluginManager' });

// ==================== 保留的事件前缀 ====================
/**
 * 保留的事件前缀
 *
 * 说明：
 * - 这些前缀被引擎内部使用
 * - 插件不能使用这些前缀作为 eventPrefix
 * - 避免与引擎事件冲突
 *
 * 为什么需要保留？
 * - 保证引擎内部事件的唯一性
 * - 避免插件覆盖核心事件
 * - 提供清晰的命名空间隔离
 */
const RESERVED_EVENT_PREFIX = ['designer', 'editor', 'skeleton', 'renderer', 'render', 'utils', 'plugin', 'engine', 'editor-core', 'engine-core', 'plugins', 'event', 'events', 'log', 'logger', 'ctx', 'context'];

// ==================== LowCodePluginManager 类 ====================
/**
 * 低代码插件管理器类
 *
 * 职责：
 * - 管理所有插件的生命周期
 * - 处理插件依赖关系
 * - 提供插件注册/查询/删除接口
 * - 管理插件上下文和偏好设置
 *
 * 核心数据结构：
 * ```typescript
 * {
 *   plugins: [plugin1, plugin2, ...],        // 所有插件（数组）
 *   pluginsMap: {                            // 插件映射（快速查找）
 *     'pluginA': plugin1,
 *     'pluginB': plugin2
 *   },
 *   pluginContextMap: {                      // 插件上下文
 *     'pluginA': context1,
 *     'pluginB': context2
 *   },
 *   pluginPreference: {                      // 插件偏好设置
 *     'pluginA': { key: value },
 *     'pluginB': { key: value }
 *   }
 * }
 * ```
 */
export class LowCodePluginManager implements ILowCodePluginManager {
  /**
   * 所有插件列表（按注册顺序）
   *
   * 说明：
   * - 保持插件的注册顺序
   * - 用于遍历所有插件
   */
  private plugins: ILowCodePluginRuntime[] = [];

  /**
   * 插件映射表（按名称索引）
   *
   * 说明：
   * - 用于快速查找插件（O(1)）
   * - 检查插件是否已注册
   */
  pluginsMap: Map<string, ILowCodePluginRuntime> = new Map();

  /**
   * 插件上下文映射表
   *
   * 说明：
   * - 每个插件有独立的上下文
   * - 提供隔离的 API 访问
   */
  pluginContextMap: Map<string, LowCodePluginContext> = new Map();

  /**
   * 插件偏好设置
   *
   * 说明：
   * - 存储用户配置的插件选项
   * - 在插件初始化时传入
   */
  private pluginPreference?: PluginPreference = new Map();

  /**
   * 上下文 API 组装器
   *
   * 说明：
   * - 用于构建插件上下文的 API
   * - 提供 project、designer、skeleton 等接口
   */
  contextApiAssembler: ILowCodePluginContextApiAssembler;

  /**
   * 构造函数
   *
   * @param contextApiAssembler - 上下文 API 组装器
   * @param viewName - 视图名称（用于多视图场景）
   */
  constructor(contextApiAssembler: ILowCodePluginContextApiAssembler, readonly viewName = 'global') {
    this.contextApiAssembler = contextApiAssembler;
  }

  /**
   * 获取或创建插件上下文
   *
   * @param options - 插件上下文选项
   * @returns 插件上下文
   *
   * 说明：
   * - 缓存机制：同一插件的上下文只创建一次
   * - 上下文提供了隔离的 API 访问
   *
   * 为什么需要独立上下文？
   * - 避免插件之间互相干扰
   * - 提供更好的 API 隔离
   * - 支持插件级别的事件命名空间
   */
  _getLowCodePluginContext = (options: IPluginContextOptions) => {
    const { pluginName } = options;
    // 尝试从缓存中获取
    let context = this.pluginContextMap.get(pluginName);
    if (!context) {
      // 创建新的上下文
      context = new LowCodePluginContext(options, this.contextApiAssembler);
      this.pluginContextMap.set(pluginName, context);
    }
    return context;
  };

  /**
   * 检查引擎版本是否匹配
   *
   * @param versionExp - 版本表达式（如 '^1.0.0'）
   * @returns 是否匹配
   *
   * 说明：
   * - 使用 semver 语法
   * - 支持预发布版本（includePrerelease: true）
   * - 例如：1.0.1-beta 可以匹配 '^1.0.0'
   *
   * 参考：https://github.com/npm/node-semver#functions
   *
   * @example
   * ```typescript
   * isEngineVersionMatched('^1.0.0')  // true if engine is 1.0.1
   * isEngineVersionMatched('^2.0.0')  // false if engine is 1.0.1
   * ```
   */
  isEngineVersionMatched(versionExp: string): boolean {
    const engineVersion = engineConfig.get('ENGINE_VERSION');
    // ref: https://github.com/npm/node-semver#functions
    // 1.0.1-beta should match '^1.0.0'
    return semverSatisfies(engineVersion, versionExp, { includePrerelease: true });
  }

  /**
   * register a plugin
   * @param pluginConfigCreator - a creator function which returns the plugin config
   * @param options - the plugin options
   * @param registerOptions - the plugin register options
   */
  async register(
    pluginModel: IPublicTypePlugin,
    options?: any,
    registerOptions?: IPublicTypePluginRegisterOptions,
  ): Promise<void> {
    // registerOptions maybe in the second place
    if (isLowCodeRegisterOptions(options)) {
      registerOptions = options;
      options = {};
    }
    let { pluginName, meta = {} } = pluginModel;
    const { preferenceDeclaration, engines } = meta;
    // filter invalid eventPrefix
    const { eventPrefix } = meta;
    const isReservedPrefix = RESERVED_EVENT_PREFIX.find((item) => item === eventPrefix);
    if (isReservedPrefix) {
      meta.eventPrefix = undefined;
      logger.warn(`plugin ${pluginName} is trying to use ${eventPrefix} as event prefix, which is a reserved event prefix, please use another one`);
    }
    const ctx = this._getLowCodePluginContext({ pluginName, meta });
    const customFilterValidOptions = engineConfig.get('customPluginFilterOptions', filterValidOptions);
    const pluginTransducer = engineConfig.get('customPluginTransducer', null);
    const newPluginModel = pluginTransducer ? await pluginTransducer(pluginModel, ctx, options) : pluginModel;
    const newOptions = customFilterValidOptions(options, newPluginModel.meta?.preferenceDeclaration);
    const config = newPluginModel(ctx, newOptions);
    // compat the legacy way to declare pluginName
    // @ts-ignore
    pluginName = pluginName || config.name;
    invariant(
      pluginName,
      'pluginConfigCreator.pluginName required',
      config,
    );

    ctx.setPreference(pluginName, preferenceDeclaration);

    const allowOverride = registerOptions?.override === true;

    if (this.pluginsMap.has(pluginName)) {
      if (!allowOverride) {
        throw new Error(`Plugin with name ${pluginName} exists`);
      } else {
        // clear existing plugin
        const originalPlugin = this.pluginsMap.get(pluginName);
        logger.log(
          'plugin override, originalPlugin with name ',
          pluginName,
          ' will be destroyed, config:',
          originalPlugin?.config,
        );
        originalPlugin?.destroy();
        this.pluginsMap.delete(pluginName);
      }
    }

    const engineVersionExp = engines && engines.lowcodeEngine;
    if (engineVersionExp && !this.isEngineVersionMatched(engineVersionExp)) {
      throw new Error(`plugin ${pluginName} skipped, engine check failed, current engine version is ${engineConfig.get('ENGINE_VERSION')}, meta.engines.lowcodeEngine is ${engineVersionExp}`);
    }

    const plugin = new LowCodePluginRuntime(pluginName, this, config, meta);
    // support initialization of those plugins which registered
    // after normal initialization by plugin-manager
    if (registerOptions?.autoInit) {
      await plugin.init();
    }
    this.plugins.push(plugin);
    this.pluginsMap.set(pluginName, plugin);
    logger.log(`plugin registered with pluginName: ${pluginName}, config: `, config, 'meta:', meta);
  }

  get(pluginName: string): ILowCodePluginRuntime | undefined {
    return this.pluginsMap.get(pluginName);
  }

  getAll(): ILowCodePluginRuntime[] {
    return this.plugins;
  }

  has(pluginName: string): boolean {
    return this.pluginsMap.has(pluginName);
  }

  async delete(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.find(({ name }) => name === pluginName);
    if (!plugin) return false;
    await plugin.destroy();
    const idx = this.plugins.indexOf(plugin);
    this.plugins.splice(idx, 1);
    return this.pluginsMap.delete(pluginName);
  }

  async init(pluginPreference?: PluginPreference) {
    const pluginNames: string[] = [];
    const pluginObj: { [name: string]: ILowCodePluginRuntime } = {};
    this.pluginPreference = pluginPreference;
    this.plugins.forEach((plugin) => {
      pluginNames.push(plugin.name);
      pluginObj[plugin.name] = plugin;
    });
    const { missingTasks, sequence } = sequencify(pluginObj, pluginNames);
    invariant(!missingTasks.length, 'plugin dependency missing', missingTasks);
    logger.log('load plugin sequence:', sequence);

    for (const pluginName of sequence) {
      try {
        await this.pluginsMap.get(pluginName)!.init();
      } catch (e) /* istanbul ignore next */ {
        logger.error(
          `Failed to init plugin:${pluginName}, it maybe affect those plugins which depend on this.`,
        );
        logger.error(e);
      }
    }
  }

  async destroy() {
    for (const plugin of this.plugins) {
      await plugin.destroy();
    }
  }

  get size() {
    return this.pluginsMap.size;
  }

  getPluginPreference(pluginName: string): Record<string, IPublicTypePreferenceValueType> | null | undefined {
    if (!this.pluginPreference) {
      return null;
    }
    return this.pluginPreference.get(pluginName);
  }

  toProxy() {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (target.pluginsMap.has(prop as string)) {
          // 禁用态的插件，直接返回 undefined
          if (target.pluginsMap.get(prop as string)!.disabled) {
            return undefined;
          }
          return target.pluginsMap.get(prop as string)?.toProxy();
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  /* istanbul ignore next */
  setDisabled(pluginName: string, flag = true) {
    logger.warn(`plugin:${pluginName} has been set disable:${flag}`);
    this.pluginsMap.get(pluginName)?.setDisabled(flag);
  }

  async dispose() {
    await this.destroy();
    this.plugins = [];
    this.pluginsMap.clear();
  }
}
