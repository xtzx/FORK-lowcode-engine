/**
 * @Author liyongjie
 * @Date 2025-01-17
 *
 * 【文件作用】
 * 提供低代码引擎渲染器核心的通用工具函数
 *
 * 【实现功能】
 * 1. Schema 类型判断：isSchema、isFileSchema、isJSSlot
 * 2. 表达式解析：parseExpression、parseData（核心功能）
 * 3. 国际化处理：getI18n、parseI18n
 * 4. 数据转换：transformArrayToMap、transformStringToFunction
 * 5. 组件判断：canAcceptsRef（判断组件是否支持 ref）
 * 6. 字符串处理：capitalizeFirstLetter、getFileCssName
 * 7. 对象操作：getValue、forEach、serializeParams
 *
 * 【实现方式】
 * 1. 基于 lodash 和 intl-messageformat 等第三方库
 * 2. 使用 TypeScript 类型保护（Type Guard）提供精确的类型推断
 * 3. 使用 new Function() 动态执行字符串代码（JSExpression）
 * 4. 支持跨域 iframe 场景（inSameDomain 检测）
 *
 * 【关键设计】
 * - parseExpression: 核心表达式解析器，将 JSExpression 字符串转为可执行函数
 * - parseData: 递归解析 Schema 中的所有表达式、国际化、数据绑定
 * - inSameDomain: 检测是否在同域 iframe 中，用于安全地访问 parent window
 */
import {isEmpty} from 'lodash';
import IntlMessageFormat from 'intl-messageformat';

import logger from './logger';
import {IPublicTypeRootSchema, IPublicTypeNodeSchema, IPublicTypeJSSlot} from '../../../types/src';
import {isI18nData, isJSExpression} from '../../../utils/src';
import pkg from '../../package.json';

/**
 * 【全局版本标识】
 * 将 SDK 版本号挂载到 window 对象上，便于调试和版本追踪
 *
 * 【使用场景】
 * 1. 控制台查看 SDK 版本：window.sdkVersion
 * 2. 问题排查时确认版本
 *
 * 【注意】
 * 这个设置对渲染逻辑没有影响，仅用于辅助调试
 */
(window as any).sdkVersion = pkg.version;

/**
 * 【工具函数导出】
 * 从 lodash 中导出常用的工具函数，提供统一的 API
 *
 * - pick: 从对象中选取指定的属性
 * - deepEqual (isEqualWith): 深度比较两个对象是否相等
 * - clone (cloneDeep): 深拷贝对象
 * - isEmpty: 判断值是否为空
 * - throttle: 节流函数（限制函数调用频率）
 * - debounce: 防抖函数（延迟函数执行）
 */
export {pick, isEqualWith as deepEqual, cloneDeep as clone, isEmpty, throttle, debounce} from 'lodash';

/**
 * 【表达式类型常量】
 * 定义低代码协议中支持的各种动态表达式类型
 *
 * 【类型说明】
 * - JSEXPRESSION: JS 表达式（如 `this.state.value`）
 * - JSFUNCTION: JS 函数（如 `function() { return 1; }`）
 * - JSSLOT: JS 插槽（用于渲染动态内容）
 * - JSBLOCK: JS 区块（旧版协议，已被 JSSLOT 取代）
 * - I18N: 国际化文本（如 `{ type: 'i18n', key: 'hello' }`）
 */
const EXPRESSION_TYPE = {
    JSEXPRESSION: 'JSExpression',
    JSFUNCTION: 'JSFunction',
    JSSLOT: 'JSSlot',
    JSBLOCK: 'JSBlock',  // 兼容旧协议
    I18N: 'i18n',
};

/**
 * 【类型保护】判断对象是否为合法的 Schema 结构
 *
 * 【作用】
 * 验证对象是否符合低代码 Schema 规范
 *
 * 【判断规则】
 * 满足以下任一条件即为合法 Schema：
 * 1. componentName 是 'Leaf'（叶子节点，如文本节点）
 * 2. componentName 是 'Slot'（插槽节点）
 * 3. 是 Schema 数组（数组中的每一项都是合法 Schema）
 * 4. 同时满足：
 *    - 有 componentName 属性
 *    - 有 props 属性且 props 是有效的（对象或 JSExpression）
 *
 * 【什么是有效的 props？】
 * - 存在（不是 null/undefined）
 * - 是 JSExpression（动态表达式）
 * - 是普通对象（不是数组）
 *
 * 【示例】
 * // ✅ 合法 Schema
 * { componentName: 'Button', props: { type: 'primary' } }
 * { componentName: 'Leaf', value: 'Hello' }
 * { componentName: 'Slot', name: 'header' }
 * [{ componentName: 'Button', props: {} }, { componentName: 'Input', props: {} }]
 *
 * // ❌ 非法 Schema
 * { componentName: 'Button' }  // 缺少 props
 * { props: {} }  // 缺少 componentName
 * null / undefined / {}
 *
 * @param {any} schema - 待判断的对象
 * @returns {boolean} 是否为合法 Schema
 */
export function isSchema(schema: any): schema is IPublicTypeNodeSchema {
    // 【步骤 1】空值检查
    // null、undefined、{}、[]、'' 等都返回 false
    if (isEmpty(schema)) {
        return false;
    }

    // 【步骤 2】特殊节点检查
    // Leaf（叶子节点）和 Slot（插槽）是特殊的 Schema，不需要 props
    if (schema.componentName === 'Leaf' || schema.componentName === 'Slot') {
        return true;
    }

    // 【步骤 3】数组检查
    // 如果是数组，递归检查每一项是否都是合法 Schema
    if (Array.isArray(schema)) {
        return schema.every((item) => isSchema(item));
    }

    // 【步骤 4】Props 有效性检查
    // 定义内部函数，用于判断 props 是否有效
    const isValidProps = (props: any) => {
        // props 不存在，无效
        if (!props) {
            return false;
        }

        // props 是 JSExpression（动态表达式），有效
        // 如：{ type: 'JSExpression', value: 'this.state.buttonProps' }
        if (isJSExpression(props)) {
            return true;
        }

        // props 是普通对象（不是数组），有效
        // 注意：这里使用了 schema.props 而非 props，可能是源码的 bug
        // 应该是 typeof props === 'object' && !Array.isArray(props)
        return typeof schema.props === 'object' && !Array.isArray(props);
    };

    // 【步骤 5】标准 Schema 检查
    // 同时满足：有 componentName 且 props 有效
    // !! 是双重取反，将真值转为 true，假值转为 false
    return !!(schema.componentName && isValidProps(schema.props));
}

/**
 * 【类型保护】判断是否为文件级 Schema（Page/Block/Component）
 *
 * 【作用】
 * 判断 Schema 是否是顶层的文件 Schema（可以独立运行的）
 *
 * 【文件级 Schema 的特点】
 * - Page: 页面级 Schema，包含完整的页面结构
 * - Block: 区块级 Schema，可复用的页面片段
 * - Component: 组件级 Schema，可复用的业务组件
 *
 * 【与普通 Schema 的区别】
 * - 文件级 Schema 可以有 state、methods、lifeCycles 等
 * - 普通 Schema 只是组件节点，不能有自己的状态和生命周期
 *
 * 【使用场景】
 * 1. Renderer.render() 中验证根 Schema 是否合法
 * 2. 判断是否需要初始化 state 和 lifeCycles
 *
 * 【示例】
 * // ✅ 文件级 Schema
 * { componentName: 'Page', state: {}, methods: {}, children: [] }
 * { componentName: 'Block', state: {}, children: [] }
 * { componentName: 'Component', state: {}, children: [] }
 *
 * // ❌ 非文件级 Schema
 * { componentName: 'Button', props: {} }
 * { componentName: 'Div', props: {} }
 *
 * @param {IPublicTypeNodeSchema} schema - 节点 Schema
 * @returns {boolean} 是否为文件级 Schema
 */
export function isFileSchema(schema: IPublicTypeNodeSchema): schema is IPublicTypeRootSchema {
    // 【步骤 1】先检查是否是合法 Schema
    if (!isSchema(schema)) {
        return false;
    }

    // 【步骤 2】检查 componentName 是否是文件级类型
    return ['Page', 'Block', 'Component'].includes(schema.componentName);
}

/**
 * 🌐 检查是否在同域 iframe 中
 *
 * 【作用】
 * 判断当前页面是否嵌套在另一个同域的父页面中
 *
 * 【应用场景】
 * 1. parseExpression 中使用父窗口的 __newFunc（安全考虑）
 * 2. transformStringToFunction 中使用父窗口的 Function 构造器
 *
 * 【判断逻辑】
 * 同时满足两个条件：
 * 1. window.parent !== window（当前页面在 iframe 中）
 * 2. window.parent.location.host === window.location.host（同域）
 *
 * 【为什么需要？】
 * - 跨域 iframe 无法访问 parent.location.host，会抛出异常
 * - 通过 try-catch 捕获异常，返回 false
 * - 同域 iframe 可以安全地访问父窗口的对象
 *
 * 【为什么使用父窗口的 Function？】
 * - 确保 new Function 创建的函数在顶层 window 上下文中
 * - 避免 iframe 沙箱的限制
 * - 提高安全性
 *
 * @returns {boolean} true 表示在同域 iframe 中，false 表示不在或跨域
 *
 * @example
 * // 在同域 iframe 中
 * inSameDomain() // true
 *
 * // 在跨域 iframe 中
 * inSameDomain() // false（捕获异常）
 *
 * // 在顶层窗口中
 * inSameDomain() // false（window.parent === window）
 */
export function inSameDomain() {
    try {
        // 检查两个条件：
        // 1. window.parent !== window：当前窗口不是顶层窗口（在 iframe 中）
        // 2. window.parent.location.host === window.location.host：父窗口和当前窗口同域
        return window.parent !== window && window.parent.location.host === window.location.host;
    } catch (e) {
        // 跨域时访问 parent.location.host 会抛出异常
        // 捕获异常并返回 false
        return false;
    }
}

/**
 * 🎨 将文件名转换为 CSS 类名
 *
 * 【作用】
 * 将驼峰命名的文件名转换为 kebab-case 的 CSS 类名
 *
 * 【转换规则】
 * 1. 在大写字母前添加 `-`
 * 2. 转换为小写
 * 3. 添加 `lce-` 前缀
 * 4. 过滤空字符串
 *
 * 【应用场景】
 * BaseRenderer.__renderContent 中生成页面/组件的 CSS 类名
 *
 * @param {string} fileName - 文件名（如 'HomePage'、'UserList'）
 * @returns {string | undefined} CSS 类名（如 'lce-home-page'、'lce-user-list'）
 *
 * @example
 * getFileCssName('HomePage')     // 'lce-home-page'
 * getFileCssName('UserList')     // 'lce-user-list'
 * getFileCssName('MyComponent')  // 'lce-my-component'
 * getFileCssName('')             // undefined
 * getFileCssName('page')         // 'lce-page'
 *
 * 【转换步骤】
 * 输入: 'HomePage'
 *   ↓ 1. replace(/([A-Z])/g, '-$1')
 * '-Home-Page'
 *   ↓ 2. toLowerCase()
 * '-home-page'
 *   ↓ 3. 添加 'lce-' 前缀
 * 'lce--home-page'
 *   ↓ 4. split('-').filter((p) => !!p).join('-')
 * 'lce-home-page'  // 过滤掉空字符串
 */
export function getFileCssName(fileName: string) {
    // 如果文件名为空，直接返回 undefined
    if (!fileName) {
        return;
    }

    // 步骤 1-2：在大写字母前添加 `-`，并转换为小写
    // 例如：'HomePage' → '-Home-Page' → '-home-page'
    const name = fileName.replace(/([A-Z])/g, '-$1').toLowerCase();

    // 步骤 3-4：添加前缀、分割、过滤、拼接
    // 例如：'-home-page' → 'lce--home-page' → ['lce', '', 'home', 'page'] → ['lce', 'home', 'page'] → 'lce-home-page'
    return `lce-${name}`
        .split('-')              // 按 '-' 分割
        .filter((p) => !!p)      // 过滤掉空字符串（!!p 是双重取反，将真值转为 true，假值转为 false）
        .join('-');              // 重新拼接
}

/**
 * 【类型保护】判断对象是否为 JSSlot 类型
 *
 * 【作用】
 * 验证对象是否是插槽类型（JSSlot 或旧协议的 JSBlock）
 *
 * 【JSSlot 是什么？】
 * 插槽是一种特殊的 Schema 类型，用于渲染动态内容或 render props
 *
 * 【结构示例】
 * ```typescript
 * {
 *   type: 'JSSlot',         // 类型标识
 *   params: ['data', 'index'],  // 参数列表（可选）
 *   value: {                // 插槽内容（Schema）
 *     componentName: 'Button',
 *     props: { children: '{{data.name}}' }
 *   }
 * }
 * ```
 *
 * 【应用场景】
 * 1. 渲染 render props：如 Table 的 columns.render
 * 2. 插槽渲染：如 Dialog 的 footer
 * 3. 动态内容：需要根据参数渲染不同内容
 *
 * 【判断规则】
 * 满足所有条件：
 * 1. obj 不为空
 * 2. obj 是对象（不是数组）
 * 3. obj.type 是 'JSSlot' 或 'JSBlock'（兼容旧协议）
 *
 * @param {any} obj - 待判断的对象
 * @returns {boolean} 是否为 JSSlot 类型
 *
 * @example
 * // ✅ 合法 JSSlot
 * isJSSlot({ type: 'JSSlot', value: {...} })  // true
 * isJSSlot({ type: 'JSBlock', value: {...} }) // true（兼容旧协议）
 *
 * // ❌ 非法 JSSlot
 * isJSSlot(null)                               // false
 * isJSSlot({ type: 'JSExpression' })           // false
 * isJSSlot([])                                 // false
 * isJSSlot('string')                           // false
 */
export function isJSSlot(obj: any): obj is IPublicTypeJSSlot {
    // 【步骤 1】空值检查
    if (!obj) {
        return false;
    }

    // 【步骤 2】类型检查：必须是对象，且不是数组
    if (typeof obj !== 'object' || Array.isArray(obj)) {
        return false;
    }

    // 【步骤 3】类型标识检查
    // 兼容旧协议：JSBlock 是早期的插槽类型，现在改为 JSSlot
    return [EXPRESSION_TYPE.JSSLOT, EXPRESSION_TYPE.JSBLOCK].includes(obj.type);
}

/**
 * 🔍 从对象中获取嵌套属性的值（lodash.get 的简化版）
 *
 * 【作用】
 * 通过路径字符串访问对象的嵌套属性，支持默认值
 *
 * 【路径语法】
 * 使用 `.` 分隔属性路径
 *
 * @param {any} obj - 目标对象
 * @param {string} path - 属性路径（如 'user.name' 或 'data.items.0.title'）
 * @param {any} defaultValue - 默认值（当路径不存在时返回，默认为 {}）
 * @returns {any} 属性值或默认值
 *
 * @example
 * const obj = {
 *   user: {
 *     name: 'Alice',
 *     profile: {
 *       age: 25
 *     }
 *   },
 *   items: [{ id: 1 }, { id: 2 }]
 * };
 *
 * getValue(obj, 'user.name')                // 'Alice'
 * getValue(obj, 'user.profile.age')         // 25
 * getValue(obj, 'user.email', 'N/A')        // 'N/A'（不存在，返回默认值）
 * getValue(obj, 'items.0.id')               // 1（数组索引）
 * getValue([], 'any.path')                  // {}（数组直接返回默认值）
 * getValue(null, 'any.path')                // {}（null 返回默认值）
 *
 * 【实现原理】
 * 1. 将路径按 `.` 分割为数组：'user.name' → ['user', 'name']
 * 2. 使用 reduce 逐层访问：obj → obj['user'] → obj['user']['name']
 * 3. 如果中间任何一层为空，返回 undefined
 * 4. 最终结果为 undefined 时，返回默认值
 */
export function getValue(obj: any, path: string, defaultValue = {}) {
    // 【校验 1】数组类型无效，直接返回默认值
    // 为什么？数组应该通过索引访问，不应该使用对象路径
    if (Array.isArray(obj)) {
        return defaultValue;
    }

    // 【校验 2】空值或非对象类型，返回默认值
    if (isEmpty(obj) || typeof obj !== 'object') {
        return defaultValue;
    }

    // 【核心逻辑】使用 reduce 逐层访问属性
    // 步骤：
    // 1. path.split('.')：将路径分割为数组
    //    'user.name' → ['user', 'name']
    // 2. reduce((pre, cur) => ...)：累加器
    //    初始值：obj
    //    第 1 次：pre = obj, cur = 'user'  → pre['user'] = { name: 'Alice' }
    //    第 2 次：pre = { name: 'Alice' }, cur = 'name'  → pre['name'] = 'Alice'
    // 3. pre && pre[cur]：防止中间层为 null/undefined 导致错误
    const res = path.split('.').reduce((pre, cur) => {
        return pre && pre[cur];  // 安全访问：如果 pre 为空，返回 undefined
    }, obj);

    // 如果结果为 undefined，返回默认值
    if (res === undefined) {
        return defaultValue;
    }
    return res;
}

/**
 * 用于处理国际化字符串
 * @param {*} key 语料标识
 * @param {*} values 字符串模版变量
 * @param {*} locale 国际化标识，例如 zh-CN、en-US
 * @param {*} messages 国际化语言包
 */
export function getI18n(key: string, values = {}, locale = 'zh-CN', messages: Record<string, any> = {}) {
    if (!messages || !messages[locale] || !messages[locale][key]) {
        return '';
    }
    const formater = new IntlMessageFormat(messages[locale][key], locale);
    return formater.format(values);
}

/**
 * 判断当前组件是否能够设置ref
 * @param {*} Comp 需要判断的组件
 */
export function canAcceptsRef(Comp: any) {
    const hasSymbol = typeof Symbol === 'function' && Symbol.for;
    const REACT_FORWARD_REF_TYPE = hasSymbol ? Symbol.for('react.forward_ref') : 0xead0;
    // eslint-disable-next-line max-len
    return (
        Comp?.$$typeof === REACT_FORWARD_REF_TYPE ||
        Comp?.prototype?.isReactComponent ||
        Comp?.prototype?.setState ||
        Comp._forwardRef
    );
}

/**
 * transform array to a object
 * @param arr array to be transformed
 * @param key key of array item, which`s value will be used as key in result map
 * @param overwrite overwrite existing item in result or not
 * @returns object result map
 */
export function transformArrayToMap(arr: any[], key: string, overwrite = true) {
    if (isEmpty(arr) || !Array.isArray(arr)) {
        return {};
    }
    const res: any = {};
    arr.forEach((item) => {
        const curKey = item[key];
        if (item[key] === undefined) {
            return;
        }
        if (res[curKey] && !overwrite) {
            return;
        }
        res[curKey] = item;
    });
    return res;
}

/**
 * transform string to a function
 * @param str function in string form
 * @returns funtion
 */
export function transformStringToFunction(str: string) {
    if (typeof str !== 'string') {
        return str;
    }
    if (inSameDomain() && (window.parent as any).__newFunc) {
        return (window.parent as any).__newFunc(`"use strict"; return ${str}`)();
    } else {
        return new Function(`"use strict"; return ${str}`)();
    }
}

/**
 * 🔥 核心表达式解析器（最核心的动态执行引擎）
 *
 * 【作用】
 * 将 JSExpression 字符串转换为可执行的代码，并在指定作用域中执行
 *
 * 【核心原理】
 * 1. 替换 `this` → `__self`（使表达式可在任意上下文执行）
 * 2. 使用 `with` 语句扩展作用域链（简化属性访问）
 * 3. 使用 `new Function` 动态创建函数
 * 4. 立即执行并返回结果
 *
 * 【为什么替换 this？】
 * - 表达式中的 `this` 需要指向自定义的 scope 对象
 * - 但 `new Function` 创建的函数，`this` 指向 window（严格模式下为 undefined）
 * - 通过 `__self = arguments[0]` 传递真正的 scope
 *
 * 【为什么使用 with？】
 * - 允许省略 `this.`：`state.count` 等价于 `this.state.count`
 * - 简化表达式书写：`count + 1` 而不是 `this.state.count + 1`
 * - 自动在作用域链中查找属性
 *
 * 【安全性考虑】
 * - 使用 "use strict" 严格模式
 * - 优先使用父窗口的 __newFunc（避免 iframe 沙箱限制）
 * - try-catch 捕获执行错误
 *
 * @param {object | any} a - 参数1（对象模式：配置对象，位置参数模式：表达式对象）
 * @param {any} b - 参数2（作用域对象，仅位置参数模式）
 * @param {boolean} c - 参数3（是否严格要求 this，仅位置参数模式）
 * @returns {any} 表达式执行结果
 *
 * @example
 * // 方式 1：对象参数模式
 * parseExpression({
 *   str: { type: 'JSExpression', value: 'this.state.count + 1' },
 *   self: { state: { count: 5 } },
 *   thisRequired: false,
 *   logScope: 'MyComponent'
 * });  // 返回 6
 *
 * // 方式 2：位置参数模式
 * parseExpression(
 *   { type: 'JSExpression', value: 'this.state.count + 1' },
 *   { state: { count: 5 } },
 *   false
 * );  // 返回 6
 *
 * 【执行流程示例】
 * 输入：
 *   str = { value: 'this.state.count + 1' }
 *   self = { state: { count: 5 } }
 *   thisRequired = false
 *
 * 步骤 1：提取表达式字符串
 *   tarStr = 'this.state.count + 1'
 *
 * 步骤 2：替换 this → __self
 *   tarStr = '__self.state.count + 1'
 *
 * 步骤 3：添加前缀代码
 *   tarStr = '"use strict";\nvar __self = arguments[0];\nreturn __self.state.count + 1'
 *
 * 步骤 4：包装 with 语句
 *   code = 'with($scope || {}) { "use strict"; var __self = arguments[0]; return __self.state.count + 1 }'
 *
 * 步骤 5：创建并执行函数
 *   func = new Function('$scope', code)
 *   result = func(self)  // __self = self, $scope = self
 *
 * 步骤 6：返回结果
 *   return 6
 */

// 函数重载声明：支持两种参数模式
function parseExpression(options: {str: any; self: any; thisRequired?: boolean; logScope?: string}): any;
function parseExpression(str: any, self: any, thisRequired?: boolean): any;

// 函数实现
function parseExpression(a: any, b?: any, c = false) {
    // ========== 【阶段 1】参数解析 ==========
    let str;           // JSExpression 对象
    let self;          // 作用域对象
    let thisRequired;  // 是否严格要求 this
    let logScope;      // 日志作用域（用于错误提示）

    // 判断参数模式
    if (typeof a === 'object' && b === undefined) {
        // 对象参数模式：parseExpression({ str, self, thisRequired, logScope })
        str = a.str;
        self = a.self;
        thisRequired = a.thisRequired;
        logScope = a.logScope;
    } else {
        // 位置参数模式：parseExpression(str, self, thisRequired)
        str = a;
        self = b;
        thisRequired = c;
    }

    try {
        // ========== 【阶段 2】代码准备 ==========
        // 构建代码前缀数组
        const contextArr = [
            '"use strict";',              // 严格模式（防止意外的全局变量）
            'var __self = arguments[0];'  // __self 指向传入的 self 参数
        ];
        contextArr.push('return ');  // 添加 return 语句

        // 提取表达式字符串并去除空格
        let tarStr: string = (str.value || '').trim();

        // ========== 【阶段 3】替换 this → __self ==========
        // 正则说明：
        // - /this(\W|$)/g：匹配 this 后面跟非单词字符或结尾
        // - (\W|$)：捕获组，保留非单词字符（如 `.`、`(`、空格等）
        // - 为什么不匹配 thisXXX？避免误替换变量名（如 thisValue）
        //
        // 示例：
        // 'this.state' → '__self.state'
        // 'this[key]'  → '__self[key]'
        // 'this + 1'   → '__self + 1'
        // 'thisValue'  → 'thisValue'（不替换）
        //
        // ⚠️ 注意：如果原始代码中已包含 __self，可能会出现冲突
        //         但这种情况极少见，可以接受
        tarStr = tarStr.replace(/this(\W|$)/g, (_a: any, b: any) => `__self${b}`);

        // 拼接完整代码
        tarStr = contextArr.join('\n') + tarStr;
        // 结果：'"use strict";\nvar __self = arguments[0];\nreturn __self.state.count + 1'

        // ========== 【阶段 4】函数创建与执行 ==========

        // 🔥 方式 1：使用父窗口的 __newFunc（优先，更安全）
        // 为什么？确保 new Function 在顶层 window 上下文中执行
        //         避免 iframe 沙箱的限制
        if (inSameDomain() && (window.parent as any).__newFunc) {
            // window.parent.__newFunc(tarStr)：在父窗口创建函数
            // (self)：立即执行，传入 self 作为参数
            return (window.parent as any).__newFunc(tarStr)(self);
        }

        // 🔥 方式 2：使用 new Function（标准方式）

        // 构建 with 语句包装的代码
        // - thisRequired = false（默认）：with($scope || {})
        //   效果：可以直接访问 $scope 的属性
        //   示例：state.count 等价于 $scope.state.count
        //
        // - thisRequired = true（严格模式）：with({})
        //   效果：不扩展作用域，必须通过 __self 访问
        //   示例：必须写 __self.state.count，不能写 state.count
        const code = `with(${thisRequired ? '{}' : '$scope || {}'}) { ${tarStr} }`;

        // 创建函数并立即执行
        // - new Function('$scope', code)：创建函数，接收一个参数 $scope
        // - (self)：立即执行，传入 self 作为 $scope
        return new Function('$scope', code)(self);

    } catch (err) {
        // ========== 【阶段 5】错误处理 ==========
        // 记录错误日志
        logger.error(
            `${logScope || ''} parseExpression.error`,
            err,       // 错误对象
            str,       // 表达式对象
            self?.__self ?? self  // 作用域对象
        );
        return undefined;  // 返回 undefined 表示执行失败
    }
}

export {parseExpression};

export function parseThisRequiredExpression(str: any, self: any) {
    return parseExpression(str, self, true);
}

/**
 * capitalize first letter
 * @param word string to be proccessed
 * @returns string capitalized string
 */
export function capitalizeFirstLetter(word: string) {
    if (!word || !isString(word) || word.length === 0) {
        return word;
    }
    return word[0].toUpperCase() + word.slice(1);
}

/**
 * check str passed in is a string type of not
 * @param str obj to be checked
 * @returns boolean
 */
export function isString(str: any): boolean {
    return {}.toString.call(str) === '[object String]';
}

/**
 * check if obj is type of variable structure
 * @param obj object to be checked
 * @returns boolean
 */
export function isVariable(obj: any) {
    if (!obj || Array.isArray(obj)) {
        return false;
    }
    return typeof obj === 'object' && obj?.type === 'variable';
}

/**
 * 将 i18n 结构，降级解释为对 i18n 接口的调用
 * @param i18nInfo object
 * @param self context
 */
export function parseI18n(i18nInfo: any, self: any) {
    return parseExpression(
        {
            type: EXPRESSION_TYPE.JSEXPRESSION,
            value: `this.i18n('${i18nInfo.key}')`,
        },
        self,
    );
}

/**
 * for each key in targetObj, run fn with the value of the value, and the context paased in.
 * @param targetObj object that keys will be for each
 * @param fn function that process each item
 * @param context
 */
export function forEach(targetObj: any, fn: any, context?: any) {
    if (!targetObj || Array.isArray(targetObj) || isString(targetObj) || typeof targetObj !== 'object') {
        return;
    }

    Object.keys(targetObj).forEach((key) => fn.call(context, targetObj[key], key));
}

/**
 * 解析选项接口
 */
interface IParseOptions {
    thisRequiredInJSE?: boolean;  // JSExpression 中是否严格要求 this
    logScope?: string;             // 日志作用域
}

/**
 * 🔄 递归数据解析器（核心数据转换引擎）
 *
 * 【作用】
 * 递归解析 Schema 中的所有数据，将特殊类型转换为实际值
 *
 * 【核心能力】
 * 1. 解析 JSExpression：执行表达式，返回计算结果
 * 2. 解析 i18n：转换为当前语言的翻译文本
 * 3. 处理字符串：去除首尾空格
 * 4. 递归数组：解析数组中的每个元素
 * 5. 绑定函数：将函数的 this 绑定到 self
 * 6. 递归对象：解析对象中的每个属性
 * 7. 基础类型：直接返回
 *
 * 【递归深度】
 * 无限制，会递归处理所有嵌套结构
 *
 * 【应用场景】
 * 1. 初始化 state：将 schema.state 中的表达式转换为初始值
 * 2. 解析 props：将 schema.props 中的表达式转换为实际值
 * 3. 解析 dataSource 配置：转换数据源配置中的动态参数
 * 4. 解析 methods：绑定方法的 this
 *
 * @param {unknown} schema - 要解析的数据（任意类型）
 * @param {any} self - 作用域对象（表达式中的 this）
 * @param {IParseOptions} options - 解析选项
 * @returns {any} 解析后的数据
 *
 * @example
 * // 示例 1：解析 JSExpression
 * parseData(
 *   { type: 'JSExpression', value: 'this.state.count + 1' },
 *   { state: { count: 5 } }
 * )  // 返回 6
 *
 * // 示例 2：解析 i18n
 * parseData(
 *   { type: 'i18n', key: 'app.title' },
 *   this
 * )  // 返回 '应用标题'（根据当前语言）
 *
 * // 示例 3：递归解析对象
 * parseData(
 *   {
 *     count: { type: 'JSExpression', value: '0' },
 *     name: '张三',
 *     list: [
 *       { type: 'JSExpression', value: 'this.state.item1' },
 *       { type: 'JSExpression', value: 'this.state.item2' }
 *     ]
 *   },
 *   { state: { item1: 'A', item2: 'B' } }
 * )
 * // 返回：{ count: 0, name: '张三', list: ['A', 'B'] }
 *
 * // 示例 4：递归解析数组
 * parseData(
 *   [
 *     { type: 'JSExpression', value: '1 + 1' },
 *     { type: 'JSExpression', value: '2 + 2' },
 *     'static value'
 *   ],
 *   {}
 * )
 * // 返回：[2, 4, 'static value']
 *
 * 【递归流程示例】
 * 输入：
 * {
 *   title: { type: 'JSExpression', value: 'this.state.title' },
 *   config: {
 *     name: { type: 'JSExpression', value: 'this.state.name' },
 *     age: 25
 *   },
 *   items: [
 *     { type: 'JSExpression', value: 'this.state.item1' },
 *     'static'
 *   ]
 * }
 *
 * 递归过程：
 * 1. 识别为对象 → 递归解析每个属性
 *    ├─ title: 识别为 JSExpression → parseExpression → 返回 '页面标题'
 *    ├─ config: 识别为对象 → 递归解析
 *    │   ├─ name: 识别为 JSExpression → parseExpression → 返回 '张三'
 *    │   └─ age: 识别为数字 → 直接返回 25
 *    └─ items: 识别为数组 → 递归解析每个元素
 *        ├─ [0]: 识别为 JSExpression → parseExpression → 返回 '项目1'
 *        └─ [1]: 识别为字符串 → trim → 返回 'static'
 *
 * 输出：
 * {
 *   title: '页面标题',
 *   config: { name: '张三', age: 25 },
 *   items: ['项目1', 'static']
 * }
 */
export function parseData(schema: unknown, self: any, options: IParseOptions = {}): any {
    // ========== 【类型 1】JSExpression：JavaScript 表达式 ==========
    // 例如：{ type: 'JSExpression', value: 'this.state.count + 1' }
    // 执行表达式并返回结果
    if (isJSExpression(schema)) {
        return parseExpression({
            str: schema,                         // 表达式对象
            self,                                // 作用域对象
            thisRequired: options.thisRequiredInJSE,  // 是否严格要求 this
            logScope: options.logScope,          // 日志作用域
        });
    }

    // ========== 【类型 2】i18n：国际化数据 ==========
    // 例如：{ type: 'i18n', key: 'app.title' }
    // 转换为当前语言的翻译文本
    else if (isI18nData(schema)) {
        return parseI18n(schema, self);
    }

    // ========== 【类型 3】string：字符串 ==========
    // 去除首尾空格
    else if (typeof schema === 'string') {
        return schema.trim();
    }

    // ========== 【类型 4】Array：数组 ==========
    // 递归解析数组中的每个元素
    else if (Array.isArray(schema)) {
        return schema.map((item) => parseData(item, self, options));
    }

    // ========== 【类型 5】function：函数 ==========
    // 将函数的 this 绑定到 self
    // 使用场景：schema.methods 中的函数
    else if (typeof schema === 'function') {
        return schema.bind(self);
    }

    // ========== 【类型 6】object：对象 ==========
    else if (typeof schema === 'object') {
        // 特殊处理：null 和 undefined 直接返回
        // 注意：typeof null === 'object'（JavaScript 的历史遗留问题）
        if (!schema) {
            return schema;
        }

        // 递归解析对象的每个属性
        const res: any = {};
        forEach(schema, (val: any, key: string) => {
            // 🔥 跳过内部属性（以 __ 开头）
            // 内部属性通常包含：__ctx、__components、__appHelper 等
            // 这些属性不需要解析，直接使用原值
            if (key.startsWith('__')) {
                return;
            }

            // 递归解析属性值
            res[key] = parseData(val, self, options);
        });
        return res;
    }

    // ========== 【类型 7】其他基础类型 ==========
    // 包括：number、boolean、null、undefined 等
    // 直接返回，不需要解析
    return schema;
}

/**
 * process params for using in a url query
 * @param obj params to be processed
 * @returns string
 */
export function serializeParams(obj: any) {
    let result: any = [];
    forEach(obj, (val: any, key: any) => {
        if (val === null || val === undefined || val === '') {
            return;
        }
        if (typeof val === 'object') {
            result.push(`${key}=${encodeURIComponent(JSON.stringify(val))}`);
        } else {
            result.push(`${key}=${encodeURIComponent(val)}`);
        }
    });
    return result.join('&');
}
