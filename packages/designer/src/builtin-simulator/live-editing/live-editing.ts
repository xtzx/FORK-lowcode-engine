/**
 * ========================================
 * 📦 实时编辑核心模块导入
 * ========================================
 */

// 🔥 响应式状态管理：用于跟踪编辑状态变化
import { obx } from '@alilc/lowcode-editor-core';
// 📋 类型定义：插件配置和实时文本编辑配置接口
import { IPublicTypePluginConfig, IPublicTypeLiveTextEditingConfig } from '@alilc/lowcode-types';
// 🎯 文档节点模型：低代码节点和属性操作接口
import { INode, Prop } from '../../document';

/**
 * 🏷️ 编辑器标记键名常量
 *
 * 用于标识DOM元素上的可编辑属性标记
 * 格式：<div data-setter-prop="title">可编辑文本</div>
 */
const EDITOR_KEY = 'data-setter-prop';

/**
 * 🔍 查找设置器属性元素
 *
 * 在DOM树中向上查找最近的带有 data-setter-prop 属性的元素
 * 这个元素就是实际可编辑的文本容器
 *
 * @param ele - 起始查找元素（通常是双击的目标元素）
 * @param root - 根容器元素（组件的根DOM元素）
 * @returns HTMLElement | null - 找到的可编辑元素，或null表示未找到
 */
function getSetterPropElement(ele: HTMLElement, root: HTMLElement): HTMLElement | null {
  // 🔍 向上查找最近的带有 data-setter-prop 属性的祖先元素
  const box = ele.closest(`[${EDITOR_KEY}]`);

  // 🚫 验证元素有效性：元素必须存在且在根容器内
  if (!box || !root.contains(box)) {
    return null; // 未找到有效的可编辑元素
  }

  return box as HTMLElement; // 返回找到的可编辑元素
}

/**
 * 💾 默认内容保存处理器
 *
 * 当用户完成编辑时，将编辑后的文本内容保存到对应的属性中
 * 这是最基础的保存逻辑，直接将文本设置为属性值
 *
 * @param content - 编辑后的文本内容
 * @param prop - 要更新的属性对象
 */
function defaultSaveContent(content: string, prop: Prop) {
  prop.setValue(content); // 🎯 直接将文本内容设置为属性值
}

/**
 * 🎯 编辑目标接口定义
 *
 * 描述一次实时编辑操作的完整上下文信息
 */
export interface EditingTarget {
  node: INode;            // 📍 目标低代码节点
  rootElement: HTMLElement; // 🏠 组件根DOM元素
  event: MouseEvent;      // 🖱️ 触发编辑的鼠标事件
}

/**
 * ========================================
 * 📚 全局保存处理器管理
 * ========================================
 */

// 💾 保存处理器列表：存储所有注册的自定义保存逻辑
let saveHandlers: SaveHandler[] = [];

/**
 * ➕ 添加实时编辑保存处理器
 *
 * 允许外部注册自定义的内容保存逻辑
 * 支持根据不同的属性类型使用不同的保存策略
 *
 * @param handler - 保存处理器对象
 */
function addLiveEditingSaveHandler(handler: SaveHandler) {
  saveHandlers.push(handler); // 📋 添加到处理器列表
}

/**
 * 🧹 清空实时编辑保存处理器
 *
 * 清除所有已注册的自定义保存处理器
 * 通常在插件卸载或重新配置时调用
 */
function clearLiveEditingSaveHandler() {
  saveHandlers = []; // 📋 重置处理器列表
}

/**
 * ========================================
 * 🎯 特定规则管理系统
 * ========================================
 */

// 📝 特定规则列表：存储自定义的编辑规则匹配器
let specificRules: SpecificRule[] = [];

/**
 * ➕ 添加实时编辑特定规则
 *
 * 允许外部注册自定义的编辑规则
 * 用于处理特殊组件或复杂编辑场景
 *
 * @param rule - 规则函数，返回匹配的编辑配置
 */
function addLiveEditingSpecificRule(rule: SpecificRule) {
  specificRules.push(rule); // 📋 添加到规则列表
}

/**
 * 🧹 清空实时编辑特定规则
 *
 * 清除所有已注册的自定义编辑规则
 */
function clearLiveEditingSpecificRule() {
  specificRules = []; // 📋 重置规则列表
}

/**
 * ========================================
 * ✏️ 实时编辑核心控制器类
 * ========================================
 *
 * 负责管理画布上的实时文本编辑功能
 * 支持双击编辑、键盘操作、自动保存等完整的编辑体验
 */
export class LiveEditing {
  // 🎯 静态方法：暴露全局规则管理接口
  static addLiveEditingSpecificRule = addLiveEditingSpecificRule;
  static clearLiveEditingSpecificRule = clearLiveEditingSpecificRule;

  // 💾 静态方法：暴露全局保存处理器管理接口
  static addLiveEditingSaveHandler = addLiveEditingSaveHandler;
  static clearLiveEditingSaveHandler = clearLiveEditingSaveHandler;

  /**
   * 📍 当前编辑状态
   *
   * 使用 MobX 响应式引用，跟踪当前正在编辑的属性
   * null 表示没有进行编辑，Prop 对象表示正在编辑该属性
   */
  @obx.ref private _editing: Prop | null = null;

  /**
   * 🧹 清理函数
   *
   * 存储编辑结束时需要执行的清理逻辑
   * 包括移除事件监听器、恢复DOM状态等
   */
  private _dispose?: () => void;

  /**
   * 💾 保存函数
   *
   * 存储当前编辑内容的保存逻辑
   * 在用户完成编辑时调用来持久化内容
   */
  private _save?: () => void;

  /**
   * ========================================
   * 🎯 应用实时编辑 - 核心入口方法
   * ========================================
   *
   * 当用户双击组件时，尝试启动实时编辑功能
   * 这是整个实时编辑流程的开始
   *
   * @param target - 编辑目标对象，包含节点、DOM元素、事件信息
   */
  apply(target: EditingTarget) {
    // 📦 解构获取编辑目标的核心信息
    const { node, event, rootElement } = target;
    const targetElement = event.target as HTMLElement; // 🎯 双击的具体DOM元素
    const { liveTextEditing } = node.componentMeta; // 📋 组件元数据中的实时编辑配置

    // 📡 发布编辑开始事件：通知外部监听器编辑操作已开始
    const editor = node.document?.designer.editor;
    const npm = node?.componentMeta?.npm;
    // 🏷️ 构建组件标识：优先使用 "包名-组件名" 格式
    const selected =
      [npm?.package, npm?.componentName].filter((item) => !!item).join('-') || node?.componentMeta?.componentName || '';
    editor?.eventBus.emit('designer.builtinSimulator.liveEditing', {
      selected, // 📋 传递组件标识信息
    });

    // ========================================
    // 🔍 可编辑元素查找和配置匹配
    // ========================================

    // 🎯 查找带有 data-setter-prop 属性的可编辑元素
    let setterPropElement = getSetterPropElement(targetElement, rootElement);
    // 📋 获取属性目标：从 data-setter-prop 属性值中读取要编辑的属性名
    let propTarget = setterPropElement?.dataset.setterProp;
    // 🎯 匹配的编辑配置：存储找到的编辑规则配置
    let matched: (IPublicTypePluginConfig & { propElement?: HTMLElement }) | undefined | null;

    if (liveTextEditing) {
      // ========================================
      // 📋 策略1：使用组件元数据中的编辑配置
      // ========================================

      if (propTarget) {
        // 🎯 情况A：已埋点命中 data-setter-prop="propTarget"
        // 从 liveTextEditing 配置中查找匹配的规则（包含 mode、onSaveContent 等）
        matched = liveTextEditing.find(config => config.propTarget == propTarget);
      } else {
        // 🔍 情况B：执行选择器规则匹配
        // 遍历 liveTextEditing 配置，使用 selector 规则查找可编辑元素
        matched = liveTextEditing.find(config => {
          if (!config.selector) {
            return false; // 🚫 跳过没有选择器的配置
          }
          // 🎯 使用选择器查找可编辑元素
          setterPropElement = queryPropElement(rootElement, targetElement, config.selector);
          return !!setterPropElement; // ✅ 找到匹配元素则返回 true
        });
        propTarget = matched?.propTarget; // 📋 更新属性目标
      }
    } else {
      // ========================================
      // 🎯 策略2：使用全局特定规则
      // ========================================

      // 🔄 遍历全局注册的特定规则，寻找匹配的编辑配置
      specificRules.some((rule) => {
        matched = rule(target); // 🎯 执行规则函数，传入完整的编辑目标
        return !!matched; // ✅ 找到匹配规则则停止遍历
      });

      if (matched) {
        propTarget = matched.propTarget; // 📋 设置属性目标
        // 🔍 确定可编辑元素：优先使用规则返回的元素，否则通过选择器查找
        setterPropElement = matched.propElement || queryPropElement(rootElement, targetElement, matched.selector);
      }
    }

    // ========================================
    // 💡 TODO: 自动文本编辑检测（暂未实现）
    // ========================================
    // if (!propTarget) {
    //   // 🎯 自动纯文本编辑满足以下情况：
    //   //  1. children 内容都是 Leaf 且都是文本（一期功能）
    //   //  2. DOM 节点是单层容器，子集都是文本节点 (已满足)
    //   const isAllText = node.children?.every(item => {
    //     return item.isLeaf() && item.getProp('children')?.type === 'literal';
    //   });
    //   // TODO: 实现自动文本检测逻辑
    // }

    // ========================================
    // ✏️ 启动编辑模式 - 核心编辑逻辑
    // ========================================

    if (propTarget && setterPropElement) {
      // 📋 获取要编辑的属性对象
      const prop = node.getProp(propTarget, true)!;

      // 🚫 避免重复编辑：如果已经在编辑同一个属性，直接返回
      if (this._editing === prop) {
        return;
      }

      // ========================================
      // 🎯 编辑环境初始化（5个核心步骤）
      // ========================================
      //  1. 设置 contentEditable="plaintext|true"
      //  2. 添加编辑样式类名
      //  3. 聚焦并定位光标位置
      //  4. 监听失焦事件（自动保存）
      //  5. 设置编辑锁定：禁用悬停、选择、画布拖拽

      // 💾 确定保存处理器：按优先级选择保存逻辑
      const onSaveContent = matched?.onSaveContent || // 1. 匹配配置中的自定义保存器
                           saveHandlers.find(item => item.condition(prop))?.onSaveContent || // 2. 全局保存器
                           defaultSaveContent; // 3. 默认保存器

      // 🎯 步骤1：设置可编辑模式
      // 根据配置决定编辑模式：plaintext-only（纯文本）或 true（富文本）
      setterPropElement.setAttribute('contenteditable',
        matched?.mode && matched.mode !== 'plaintext' ? 'true' : 'plaintext-only');

      // 🎨 步骤2：添加编辑样式类名（用于CSS样式控制）
      setterPropElement.classList.add('engine-live-editing');

      // 🎯 步骤3：聚焦并定位光标
      setterPropElement.focus(); // 确保元素获得焦点
      setCaret(event); // 根据双击位置设置光标位置

      // 💾 步骤4：准备保存函数
      this._save = () => {
        // 🎯 保存编辑内容：从DOM元素获取文本内容并保存到属性
        onSaveContent(setterPropElement!.innerText, prop);
      };

      // ⌨️ 键盘事件处理器：处理编辑过程中的快捷键
      const keydown = (e: KeyboardEvent) => {
        console.info(e.code); // 🔍 调试信息：记录按键代码

        switch (e.code) {
          case 'Enter':
            // TODO: 检查是否为富文本模式？
            // 富文本模式下Enter创建新行，纯文本模式下可能需要结束编辑
            break;
          case 'Escape':
            // TODO: ESC键应该取消编辑并恢复原始内容
            break;
          case 'Tab':
            // 🎯 Tab键结束编辑：触发失焦事件自动保存
            setterPropElement?.blur();
        }
        // 📝 注释：其他快捷键的处理逻辑待补充
        // esc - 取消编辑
        // enter - 确认编辑或换行
        // tab - 结束编辑
      };

      // 📤 失焦事件处理器：用户点击其他地方时自动保存并结束编辑
      const focusout = (/* e: FocusEvent */) => {
        this.saveAndDispose(); // 🎯 保存内容并清理编辑状态
      };

      // 🎯 步骤5：绑定事件监听器
      setterPropElement.addEventListener('focusout', focusout); // 失焦自动保存
      setterPropElement.addEventListener('keydown', keydown, true); // 键盘快捷键（捕获阶段）

      // 🧹 准备清理函数：编辑结束时恢复DOM状态
      this._dispose = () => {
        setterPropElement!.classList.remove('engine-live-editing'); // 移除编辑样式类
        setterPropElement!.removeAttribute('contenteditable'); // 移除可编辑属性
        setterPropElement!.removeEventListener('focusout', focusout); // 移除失焦监听器
        setterPropElement!.removeEventListener('keydown', keydown, true); // 移除键盘监听器
      };

      // 📍 标记编辑状态：设置当前正在编辑的属性
      this._editing = prop;
    }

    // ========================================
    // 💡 TODO: 功能增强计划
    // ========================================

    // TODO: 处理 Enter/ESC 事件并与 FocusTracker 集成
    //       - Enter: 根据编辑模式决定是换行还是结束编辑
    //       - ESC: 取消编辑并恢复原始内容
    //       - 与焦点追踪器协调，避免冲突

    // TODO: 向上查找 b/i/a 等HTML元素的处理
    //       - 支持富文本标签的编辑
    //       - 处理嵌套HTML结构的编辑场景
    //       - 保持格式化信息
  }

  /**
   * 📍 编辑状态获取器
   *
   * 返回当前正在编辑的属性对象
   * 用于外部检查是否有编辑操作正在进行
   *
   * @returns Prop | null - 当前编辑的属性，null表示没有进行编辑
   */
  get editing() {
    return this._editing;
  }

  /**
   * ========================================
   * 💾 保存并清理 - 完成编辑流程
   * ========================================
   *
   * 保存当前编辑内容并清理编辑状态
   * 这是编辑完成的标准流程，确保内容持久化
   */
  saveAndDispose() {
    // 💾 执行保存：如果有保存函数则调用它
    if (this._save) {
      this._save(); // 保存编辑内容到属性
      this._save = undefined; // 清空保存函数引用
    }

    // 🧹 清理编辑状态：恢复DOM和内部状态
    this.dispose();
  }

  /**
   * 🧹 清理编辑状态 - 恢复正常状态
   *
   * 清理编辑相关的DOM修改和事件监听器
   * 不保存内容，仅恢复到编辑前的状态
   */
  dispose() {
    // 🧹 执行清理：如果有清理函数则调用它
    if (this._dispose) {
      this._dispose(); // 恢复DOM状态，移除事件监听器
      this._dispose = undefined; // 清空清理函数引用
    }

    // 📍 重置编辑状态：标记没有进行编辑
    this._editing = null;
  }
}

/**
 * ========================================
 * 📋 类型定义 - 实时编辑扩展接口
 * ========================================
 */

/**
 * 🎯 特定规则函数类型
 *
 * 用于定义自定义的编辑规则匹配逻辑
 * 接收编辑目标，返回匹配的编辑配置或null
 *
 * @param target - 编辑目标对象，包含节点、DOM元素、事件信息
 * @returns 匹配的编辑配置对象，包含可选的propElement属性
 */
export type SpecificRule = (target: EditingTarget) => (IPublicTypeLiveTextEditingConfig & {
  propElement?: HTMLElement; // 🎯 可选的预定义可编辑元素
}) | null;

/**
 * 💾 保存处理器接口
 *
 * 定义自定义的内容保存逻辑
 * 支持根据属性类型或其他条件使用不同的保存策略
 */
export interface SaveHandler {
  /**
   * 🎯 条件判断函数
   *
   * 判断该保存处理器是否适用于指定的属性
   *
   * @param prop - 要检查的属性对象
   * @returns boolean - true表示适用，false表示不适用
   */
  condition: (prop: Prop) => boolean;

  /**
   * 💾 内容保存函数
   *
   * 执行实际的内容保存逻辑
   *
   * @param content - 编辑后的文本内容
   * @param prop - 要更新的属性对象
   */
  onSaveContent: (content: string, prop: Prop) => void;
}

/**
 * ========================================
 * 🎯 光标定位工具函数
 * ========================================
 */

/**
 * 🎯 设置光标位置
 *
 * 根据鼠标点击位置在可编辑元素中设置文本光标
 * 确保用户可以从双击的确切位置开始编辑
 *
 * @param event - 鼠标事件，包含点击的坐标信息
 */
function setCaret(event: MouseEvent) {
  // 📋 获取文档对象：从事件中提取文档引用
  const doc = event.view?.document;
  if (!doc) return; // 🚫 文档无效则退出

  // 🎯 根据坐标创建选择范围：使用浏览器API定位光标位置
  const range = doc.caretRangeFromPoint(event.clientX, event.clientY);

  if (range) {
    // 📍 设置光标位置：立即设置和延迟设置确保光标准确定位
    selectRange(doc, range);
    setTimeout(() => selectRange(doc, range), 1); // 🕐 延迟1ms再次设置，确保稳定性
  }
}

/**
 * 📍 选择文本范围
 *
 * 在文档中选择指定的文本范围，用于设置光标位置
 *
 * @param doc - 文档对象
 * @param range - 要选择的文本范围
 */
function selectRange(doc: Document, range: Range) {
  // 🎯 获取文档的选择对象
  const selection = doc.getSelection();

  if (selection) {
    // 🧹 清除现有选择：移除所有当前的文本选择
    selection.removeAllRanges();
    // 📍 添加新选择：设置新的光标位置或文本选择
    selection.addRange(range);
  }
}

/**
 * ========================================
 * 🔍 元素查找工具函数
 * ========================================
 */

/**
 * 🔍 查询属性元素
 *
 * 在根元素中查找匹配选择器且包含目标元素的DOM元素
 * 支持 :root 特殊选择器和复杂的CSS选择器
 *
 * @param rootElement - 根容器元素，查找的起始范围
 * @param targetElement - 目标元素，必须被找到的元素包含
 * @param selector - CSS选择器字符串，用于匹配元素
 * @returns HTMLElement | null - 找到的元素或null
 */
function queryPropElement(rootElement: HTMLElement, targetElement: HTMLElement, selector?: string) {
  // 🚫 选择器验证：没有选择器则直接返回
  if (!selector) {
    return null;
  }

  // 🎯 初始查找：处理特殊的 :root 选择器或使用标准querySelector
  let propElement = selector === ':root' ? rootElement : rootElement.querySelector(selector);

  // 🚫 元素不存在检查
  if (!propElement) {
    return null;
  }

  // ✅ 包含关系验证：检查找到的元素是否包含目标元素
  if (!propElement.contains(targetElement)) {
    // 🔄 备选策略：使用 querySelectorAll 查找所有匹配元素
    // 在所有匹配的元素中找到包含目标元素的那一个
    propElement = Array.from(rootElement.querySelectorAll(selector))
      .find(item => item.contains(targetElement)) as HTMLElement;

    // 🚫 最终验证：仍然没有找到合适的元素
    if (!propElement) {
      return null;
    }
  }

  // ✅ 返回找到的可编辑元素
  return propElement as HTMLElement;
}
