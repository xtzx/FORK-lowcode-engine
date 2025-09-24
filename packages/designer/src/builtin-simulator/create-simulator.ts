/**
 * ========================================
 * 🖼️ 模拟器创建工具 - iframe 环境初始化
 * ========================================
 *
 * 在指定的 iframe 中创建完整的低代码模拟器运行环境
 * 这是低代码引擎实现沙盒化组件渲染的核心机制
 */

// NOTE: 仅用作类型标注，切勿作为实体使用
import { BuiltinSimulatorHost } from './host';
import {
  AssetLevel,
  AssetLevels,
  AssetList,
  isAssetBundle,
  isAssetItem,
  AssetType,
  assetItem,
  isCSSUrl,
} from '@alilc/lowcode-utils';

import { BuiltinSimulatorRenderer } from './renderer';

/**
 * ========================================
 * 🏗️ 创建模拟器 - 核心工厂函数
 * ========================================
 *
 * 在指定的 iframe 中初始化低代码模拟器环境
 * 包括资源注入、全局对象设置、HTML文档创建
 *
 * @param host - 模拟器宿主控制器，提供核心功能和状态管理
 * @param iframe - 目标 iframe 元素，作为隔离的渲染容器
 * @param vendors - 第三方依赖资源列表，包含 CSS/JS 文件
 * @returns Promise<BuiltinSimulatorRenderer> - 模拟器渲染器实例
 */
export function createSimulator(
  host: BuiltinSimulatorHost,
  iframe: HTMLIFrameElement,
  vendors: AssetList = [],
): Promise<BuiltinSimulatorRenderer> {
  // 🪟 获取 iframe 的 window 和 document 对象
  // 这些是操作 iframe 内容的核心引用
  const win: any = iframe.contentWindow;
  const doc = iframe.contentDocument!;

  // 🔌 获取内部插件系统，提供低代码引擎的核心API
  const innerPlugins = host.designer.editor.get('innerPlugins');

  // ========================================
  // 🌍 全局对象注入 - 建立主窗口与iframe的通信桥梁
  // ========================================

  // 💉 注入低代码引擎API：使iframe内的组件能访问引擎功能
  win.AliLowCodeEngine = innerPlugins._getLowCodePluginContext({});

  // 💉 注入模拟器宿主：提供iframe与主窗口的双向通信能力
  win.LCSimulatorHost = host;

  // 💉 注入工具库：共享主窗口的lodash等工具库
  win._ = window._;

  // ========================================
  // 📦 资源容器初始化 - 按优先级组织CSS和JS资源
  // ========================================

  // 🎨 样式资源容器：按AssetLevel分类存储CSS链接和内联样式
  const styles: any = {};
  // 📜 脚本资源容器：按AssetLevel分类存储JS链接和内联脚本
  const scripts: any = {};

  // 🔄 遍历所有资源级别，初始化空数组
  // AssetLevel包括：Environment(环境)、Library(库)、Theme(主题)、Runtime(运行时)
  AssetLevels.forEach((lv) => {
    styles[lv] = []; // 初始化样式数组
    scripts[lv] = []; // 初始化脚本数组
  });

  /**
   * ========================================
   * 🔍 资源列表解析器 - 递归解析复杂资源结构
   * ========================================
   *
   * 解析各种格式的资源配置，转换为HTML标签字符串
   * 支持嵌套bundle、数组、单个资源等多种格式
   *
   * @param assets - 资源列表，支持多种嵌套格式
   * @param level - 资源级别，影响加载顺序和优先级
   */
  function parseAssetList(assets: AssetList, level?: AssetLevel) {
    // 🔄 遍历资源列表中的每个资源项
    for (let asset of assets) {
      // 🚫 跳过空资源项
      if (!asset) {
        continue;
      }

      // 📦 处理资源包(Bundle)：包含多个子资源的容器
      if (isAssetBundle(asset)) {
        if (asset.assets) {
          // 🔄 递归解析子资源，支持数组和单个资源
          parseAssetList(
            Array.isArray(asset.assets) ? asset.assets : [asset.assets],
            asset.level || level, // 继承或覆盖资源级别
          );
        }
        continue;
      }

      // 📝 处理资源数组：扁平化处理嵌套数组
      if (Array.isArray(asset)) {
        // 🔄 递归解析数组中的资源
        parseAssetList(asset, level);
        continue;
      }

      // 🔧 规范化资源项：将字符串URL转换为标准资源对象
      if (!isAssetItem(asset)) {
        // 🎯 自动识别资源类型：根据URL后缀判断是CSS还是JS
        asset = assetItem(isCSSUrl(asset) ? AssetType.CSSUrl : AssetType.JSUrl, asset, level)!;
      }

      // 🏷️ 生成资源标识属性
      const id = asset.id ? ` data-id="${asset.id}"` : '';
      // 📊 确定资源级别：优先使用资源自身级别，其次参数级别，最后默认环境级别
      const lv = asset.level || level || AssetLevel.Environment;
      // 📜 生成脚本类型属性
      const scriptType = asset.scriptType ? ` type="${asset.scriptType}"` : '';

      // ========================================
      // 🏗️ HTML标签生成 - 根据资源类型生成相应标签
      // ========================================

      if (asset.type === AssetType.JSUrl) {
        // 📜 外部JS文件：生成script标签引用外部文件
        scripts[lv].push(
          `<script src="${asset.content}"${id}${scriptType}></script>`,
        );
      } else if (asset.type === AssetType.JSText) {
        // 📜 内联JS代码：生成script标签包含代码内容
        scripts[lv].push(`<script${id}${scriptType}>${asset.content}</script>`);
      } else if (asset.type === AssetType.CSSUrl) {
        // 🎨 外部CSS文件：生成link标签引用外部样式
        styles[lv].push(
          `<link rel="stylesheet" href="${asset.content}"${id} />`,
        );
      } else if (asset.type === AssetType.CSSText) {
        // 🎨 内联CSS样式：生成style标签包含样式内容
        styles[lv].push(
          `<style type="text/css"${id}>${asset.content}</style>`,
        );
      }
    }
  }

  // 🚀 开始解析vendor资源：解析所有第三方依赖资源
  parseAssetList(vendors);

  // ========================================
  // 🧵 HTML片段生成 - 按级别组装最终的HTML内容
  // ========================================

  // 🎨 生成样式片段：将所有CSS资源按级别连接
  const styleFrags = Object.keys(styles)
    .map((key) => {
      // 📋 每个级别添加元数据标记，便于调试和资源管理
      return `${styles[key].join('\n')}<meta level="${key}" />`;
    })
    .join('');

  // 📜 生成脚本片段：将所有JS资源按级别连接
  const scriptFrags = Object.keys(scripts)
    .map((key) => {
      return scripts[key].join('\n');
    })
    .join('');

  // ========================================
  // 📄 HTML文档创建 - 构建完整的iframe文档结构
  // ========================================

  // 📝 打开文档流：准备写入新的HTML内容
  doc.open();

  // ✍️ 写入完整的HTML文档：包含所有资源和必要的结构
  doc.write(`
<!doctype html>
<html class="engine-design-mode">
  <head><meta charset="utf-8"/>
    ${styleFrags}
  </head>
  <body>
    ${scriptFrags}
  </body>
</html>`);

  // 🔒 关闭文档流：完成HTML内容写入
  doc.close();

  // ========================================
  // ⏳ 渲染器等待 - 异步等待模拟器初始化完成
  // ========================================

  return new Promise((resolve) => {
    // 🔍 检查渲染器是否已经加载完成
    const renderer = win.SimulatorRenderer;
    if (renderer) {
      // ✅ 渲染器已存在，立即返回
      return resolve(renderer);
    }

    // ⏳ 等待iframe加载完成的回调函数
    const loaded = () => {
      // 🎯 优先使用iframe内的渲染器，否则使用宿主的渲染器
      resolve(win.SimulatorRenderer || host.renderer);
      // 🧹 清理事件监听器，避免内存泄漏
      win.removeEventListener('load', loaded);
    };

    // 👂 监听iframe的load事件，等待所有资源加载完成
    win.addEventListener('load', loaded);
  });
}
