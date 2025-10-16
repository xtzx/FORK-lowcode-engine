/**
 * @file valueToSource 值转源码工具
 * @description 将 JavaScript 值转换为可执行的源码字符串
 *
 * 核心功能：
 * 1. 类型转换：支持所有 JS 类型（基础类型、对象、数组、Map、Set、Date、RegExp 等）
 * 2. 循环引用检测：防止无限递归
 * 3. 格式化输出：支持缩进和换行
 * 4. 函数处理：可选是否包含函数
 *
 * 使用场景：
 * - 代码生成：将 Schema 转换为源码
 * - 调试输出：将复杂对象转换为可读字符串
 * - 属性序列化：将属性值转换为代码
 *
 * @example
 * ```typescript
 * // 基础类型
 * valueToSource(123) // '123'
 * valueToSource('hello') // '"hello"'
 * valueToSource(true) // 'true'
 *
 * // 对象
 * valueToSource({ a: 1, b: 2 })
 * // '{
 * //   a: 1,
 * //   b: 2
 * // }'
 *
 * // 数组
 * valueToSource([1, 2, 3]) // '[1, 2, 3]'
 *
 * // Date
 * valueToSource(new Date('2024-01-01'))
 * // 'new Date("2024-01-01T00:00:00.000Z")'
 *
 * // Map
 * valueToSource(new Map([['a', 1]]))
 * // 'new Map([["a", 1]])'
 * ```
 */

// ==================== 辅助函数：检查属性名是否需要引号 ====================
/**
 * 检查属性名是否需要引号
 *
 * @param propertyName - 属性名
 * @returns 是否需要引号
 *
 * 规则：
 * - 合法标识符不需要引号：`{ name: 'value' }`
 * - 非法标识符需要引号：`{ 'my-name': 'value' }`
 *
 * 实现原理：
 * 1. 尝试在对象字面量中使用该属性名
 * 2. 如果不报错，说明不需要引号
 * 3. 如果报错，说明需要引号
 *
 * @example
 * ```typescript
 * propertyNameRequiresQuotes('name')      // false - 合法标识符
 * propertyNameRequiresQuotes('my-name')   // true  - 包含连字符
 * propertyNameRequiresQuotes('123')       // true  - 以数字开头
 * propertyNameRequiresQuotes('__proto__') // false - 合法标识符
 * ```
 */
function propertyNameRequiresQuotes(propertyName: string) {
  try {
    const context = {
      worksWithoutQuotes: false,
    };

    // 尝试在对象字面量中使用该属性名
    // 如果不报错，说明不需要引号
    // eslint-disable-next-line no-new-func
    new Function('ctx', `ctx.worksWithoutQuotes = {${propertyName}: true}['${propertyName}']`)();

    return !context.worksWithoutQuotes;
  } catch (ex) {
    // 语法错误，需要引号
    return true;
  }
}

// ==================== 辅助函数：字符串引号处理 ====================
/**
 * 给字符串添加引号并转义
 *
 * @param str - 原始字符串
 * @param doubleQuote - 是否使用双引号
 * @returns 带引号的字符串
 *
 * 处理：
 * - 双引号：转义内部的双引号
 * - 单引号：转义内部的单引号
 *
 * @example
 * ```typescript
 * quoteString('hello', { doubleQuote: true })  // '"hello"'
 * quoteString('hello', { doubleQuote: false }) // "'hello'"
 * quoteString('say "hi"', { doubleQuote: true }) // '"say \"hi\""'
 * ```
 */
function quoteString(str: string, { doubleQuote }: any) {
  return doubleQuote ? `"${str.replace(/"/gu, '\\"')}"` : `'${str.replace(/'/gu, "\\'")}'`;
}

// ==================== 核心函数：值转源码 ====================
/**
 * 将 JavaScript 值转换为源码字符串
 *
 * @param value - 要转换的值
 * @param options - 转换选项
 * @returns 源码字符串
 *
 * 选项：
 * - circularReferenceToken: 循环引用占位符（默认 'CIRCULAR_REFERENCE'）
 * - doubleQuote: 是否使用双引号（默认 true）
 * - includeFunctions: 是否包含函数（默认 true）
 * - includeUndefinedProperties: 是否包含 undefined 属性（默认 false）
 * - indentLevel: 缩进级别（默认 0）
 * - indentString: 缩进字符串（默认 '  '）
 * - lineEnding: 行结束符（默认 '\n'）
 * - visitedObjects: 已访问对象集合（用于循环引用检测）
 *
 * 支持的类型：
 * 1. 基础类型：boolean, number, string, undefined, null
 * 2. 特殊类型：function, symbol
 * 3. 内置对象：Date, RegExp, Map, Set
 * 4. 结构类型：Array, Object
 *
 * 循环引用处理：
 * ```typescript
 * const obj: any = { a: 1 };
 * obj.self = obj;
 * valueToSource(obj)
 * // {
 * //   a: 1,
 * //   self: CIRCULAR_REFERENCE
 * // }
 * ```
 */
export function valueToSource(
  value: any,
  {
    circularReferenceToken = 'CIRCULAR_REFERENCE',
    doubleQuote = true,
    includeFunctions = true,
    includeUndefinedProperties = false,
    indentLevel = 0,
    indentString = '  ',
    lineEnding = '\n',
    visitedObjects = new Set(),
  }: any = {},
): any {
  // 根据值的类型进行不同处理
  switch (typeof value) {
    // ==================== 布尔值 ====================
    case 'boolean':
      return value ? `${indentString.repeat(indentLevel)}true` : `${indentString.repeat(indentLevel)}false`;

    // ==================== 函数 ====================
    case 'function':
      // 如果允许包含函数，直接转为字符串
      if (includeFunctions) {
        return `${indentString.repeat(indentLevel)}${value}`;
      }
      // 否则返回 null（跳过该属性）
      return null;

    // ==================== 数字 ====================
    case 'number':
      return `${indentString.repeat(indentLevel)}${value}`;

    // ==================== 对象（包括 null、数组、内置对象等）====================
    case 'object':
      // null 值
      if (!value) {
        return `${indentString.repeat(indentLevel)}null`;
      }

      // 循环引用检测：如果已访问过该对象，返回占位符
      if (visitedObjects.has(value)) {
        return `${indentString.repeat(indentLevel)}${circularReferenceToken}`;
      }

      // Date 对象：转换为 new Date(...)
      if (value instanceof Date) {
        // 使用 ISO 字符串格式
        return `${indentString.repeat(indentLevel)}new Date(${quoteString(value.toISOString(), {
          doubleQuote,
        })})`;
      }

      // Map 对象：转换为 new Map([...])
      if (value instanceof Map) {
        // 空 Map
        // 非空 Map：递归转换键值对数组
        return value.size
          ? `${indentString.repeat(indentLevel)}new Map(${valueToSource([...value], {
            circularReferenceToken,
            doubleQuote,
            includeFunctions,
            includeUndefinedProperties,
            indentLevel,
            indentString,
            lineEnding,
            visitedObjects: new Set([value, ...visitedObjects]), // 标记为已访问
          }).slice(indentLevel * indentString.length)})`
          : `${indentString.repeat(indentLevel)}new Map()`;
      }

      // RegExp 对象：转换为 /pattern/flags
      if (value instanceof RegExp) {
        return `${indentString.repeat(indentLevel)}/${value.source}/${value.flags}`;
      }

      // Set 对象：转换为 new Set([...])
      if (value instanceof Set) {
        // 空 Set
        // 非空 Set：递归转换值数组
        return value.size
          ? `${indentString.repeat(indentLevel)}new Set(${valueToSource([...value], {
            circularReferenceToken,
            doubleQuote,
            includeFunctions,
            includeUndefinedProperties,
            indentLevel,
            indentString,
            lineEnding,
            visitedObjects: new Set([value, ...visitedObjects]), // 标记为已访问
          }).slice(indentLevel * indentString.length)})`
          : `${indentString.repeat(indentLevel)}new Set()`;
      }

      // 数组：转换为 [...]
      if (Array.isArray(value)) {
        // 空数组
        if (!value.length) {
          return `${indentString.repeat(indentLevel)}[]`;
        }

        // 判断是否将所有项放在同一行
        // 规则：所有项都是简单对象时，保持在同一行
        const itemsStayOnTheSameLine = value.every(
          item => typeof item === 'object' &&
            item &&
            !(item instanceof Date) &&
            !(item instanceof Map) &&
            !(item instanceof RegExp) &&
            !(item instanceof Set) &&
            (Object.keys(item).length || value.length === 1),
        );

        // 处理稀疏数组（有空槽的数组）
        let previousIndex: number | null = null;

        // 递归转换每一项
        value = value.reduce((items, item, index) => {
          // 填充空槽
          if (previousIndex !== null) {
            for (let i = index - previousIndex - 1; i > 0; i -= 1) {
              items.push(indentString.repeat(indentLevel + 1));
            }
          }

          previousIndex = index;

          // 递归转换当前项
          item = valueToSource(item, {
            circularReferenceToken,
            doubleQuote,
            includeFunctions,
            includeUndefinedProperties,
            indentLevel: itemsStayOnTheSameLine ? indentLevel : indentLevel + 1,
            indentString,
            lineEnding,
            visitedObjects: new Set([value, ...visitedObjects]), // 标记为已访问
          });

          // 处理 null 值（函数被跳过）
          if (item === null) {
            items.push(indentString.repeat(indentLevel + 1));
          } else if (itemsStayOnTheSameLine) {
            // 同一行：去掉前导缩进
            items.push(item.slice(indentLevel * indentString.length));
          } else {
            // 多行：保持缩进
            items.push(item);
          }

          return items;
        }, []);

        // 格式化输出
        return itemsStayOnTheSameLine
          ? `${indentString.repeat(indentLevel)}[${value.join(', ')}]` // 单行
          : `${indentString.repeat(indentLevel)}[${lineEnding}${value.join(
            `,${lineEnding}`,
          )}${lineEnding}${indentString.repeat(indentLevel)}]`; // 多行
      }

      // 普通对象：转换为 {...}
      value = Object.keys(value).reduce<string[]>((entries, propertyName) => {
        const propertyValue = value[propertyName];

        // 递归转换属性值
        // 如果是 undefined 且不包含 undefined 属性，则跳过
        const propertyValueString =
            typeof propertyValue !== 'undefined' || includeUndefinedProperties
              ? valueToSource(value[propertyName], {
                circularReferenceToken,
                doubleQuote,
                includeFunctions,
                includeUndefinedProperties,
                indentLevel: indentLevel + 1,
                indentString,
                lineEnding,
                visitedObjects: new Set([value, ...visitedObjects]), // 标记为已访问
              })
              : null;

        if (propertyValueString) {
          // 属性名：检查是否需要引号
          const quotedPropertyName = propertyNameRequiresQuotes(propertyName)
            ? quoteString(propertyName, {
              doubleQuote,
            })
            : propertyName;

          // 去掉属性值的前导缩进
          const trimmedPropertyValueString = propertyValueString.slice((indentLevel + 1) * indentString.length);

          // 特殊处理：函数简写形式（如 `foo() {}` 而不是 `foo: function foo() {}`）
          if (typeof propertyValue === 'function' && trimmedPropertyValueString.startsWith(`${propertyName}()`)) {
            entries.push(
              `${indentString.repeat(indentLevel + 1)}${quotedPropertyName} ${trimmedPropertyValueString.slice(
                propertyName.length,
              )}`,
            );
          } else {
            // 标准格式：`key: value`
            entries.push(`${indentString.repeat(indentLevel + 1)}${quotedPropertyName}: ${trimmedPropertyValueString}`);
          }
        }

        return entries;
      }, []);

      // 格式化输出
      return value.length
        ? `${indentString.repeat(indentLevel)}{${lineEnding}${value.join(
          `,${lineEnding}`,
        )}${lineEnding}${indentString.repeat(indentLevel)}}` // 非空对象（多行）
        : `${indentString.repeat(indentLevel)}{}`; // 空对象

    // ==================== 字符串 ====================
    case 'string':
      return `${indentString.repeat(indentLevel)}${quoteString(value, {
        doubleQuote,
      })}`;

    // ==================== Symbol ====================
    case 'symbol': {
      // 尝试获取全局 Symbol 的 key
      let key = Symbol.keyFor(value);

      // 全局 Symbol：Symbol.for('key')
      if (typeof key === 'string') {
        return `${indentString.repeat(indentLevel)}Symbol.for(${quoteString(key, {
          doubleQuote,
        })})`;
      }

      // 本地 Symbol：Symbol('key')
      // 从 Symbol(key) 字符串中提取 key
      key = value.toString().slice(7, -1);

      if (key) {
        return `${indentString.repeat(indentLevel)}Symbol(${quoteString(key, {
          doubleQuote,
        })})`;
      }

      // 匿名 Symbol：Symbol()
      return `${indentString.repeat(indentLevel)}Symbol()`;
    }

    // ==================== undefined ====================
    case 'undefined':
      return `${indentString.repeat(indentLevel)}undefined`;

    // ==================== 其他类型 ====================
    default:
      // 未知类型，返回 undefined
      return `${indentString.repeat(indentLevel)}undefined`;
  }
}

// ==================== 便捷函数：获取源码 ====================
/**
 * 获取值的源码字符串（带缓存）
 *
 * @param value - 要转换的值
 * @returns 源码字符串
 *
 * 特性：
 * - 结果缓存：将结果存储在 value.__source
 * - 空字符串：undefined 转换为空字符串
 *
 * @example
 * ```typescript
 * getSource({ a: 1 })
 * // '{\n  a: 1\n}'
 *
 * getSource(undefined)
 * // ''
 * ```
 */
export function getSource(value: any): string {
  // 缓存命中：直接返回
  if (value && value.__source) {
    return value.__source;
  }

  // 转换为源码
  let source = valueToSource(value);

  // undefined 转换为空字符串
  if (source === 'undefined') {
    source = '';
  }

  // 缓存结果（避免重复转换）
  if (value) {
    try {
      value.__source = source;
    } catch (ex) {
      // 某些对象不可扩展（如冻结对象）
      console.error(ex);
    }
  }

  return source;
}
