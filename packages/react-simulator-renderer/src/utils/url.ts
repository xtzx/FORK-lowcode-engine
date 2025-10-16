/**
 * @file URL 参数处理工具
 * @description 提供 URL 查询字符串的解析、序列化、编解码等功能
 *
 * 作用：
 * - 解析查询字符串为对象
 * - 对象序列化为查询字符串
 * - URL 编解码
 * - 为 URL 添加查询参数
 *
 * 使用场景：
 * - 内存路由携带参数：router.push(path, params)
 * - legaoBuiltins.getUrlParams() 获取 URL 参数
 * - 处理跨文档的参数传递
 */

/**
 * 解析查询字符串为对象
 *
 * @param str - 查询字符串，如 '?q=query&b=test' 或 'q=query&b=test'
 * @returns 解析后的参数对象
 *
 * 功能特性：
 * 1. 自动去除开头的 ?、# 或 & 符号
 * 2. 支持 + 号解析为空格（URL 编码规范）
 * 3. 自动 URL 解码（decodeURIComponent）
 * 4. 支持同名参数（转换为数组）
 * 5. 支持值中包含 = 号（如 key=a=b）
 *
 * @example
 * ```typescript
 * parseQuery('?name=张三&age=18')
 * // { name: '张三', age: '18' }
 *
 * parseQuery('color=red&color=blue')
 * // { color: ['red', 'blue'] }
 *
 * parseQuery('key=value=with=equals')
 * // { key: 'value=with=equals' }
 *
 * parseQuery('search=hello+world')
 * // { search: 'hello world' }
 * ```
 */
export function parseQuery(str: string): object {
  // 初始化返回对象
  const ret: any = {};

  // ===== 第1步：类型检查 =====
  // 如果不是字符串，返回空对象
  if (typeof str !== 'string') {
    return ret;
  }

  // ===== 第2步：字符串预处理 =====
  // trim() 去除首尾空格
  // replace(/^(\?|#|&)/, '') 去除开头的 ?、# 或 &
  // 支持多种格式：
  // - '?a=1&b=2'  -> 'a=1&b=2'
  // - '#a=1&b=2'  -> 'a=1&b=2'
  // - 'a=1&b=2'   -> 'a=1&b=2'
  const s = str.trim().replace(/^(\?|#|&)/, '');

  // 如果处理后是空字符串，返回空对象
  if (!s) {
    return ret;
  }

  // ===== 第3步：解析参数 =====
  // 按 & 分割参数对
  s.split('&').forEach((param) => {
    // --- 3.1 分割键值对 ---
    // replace(/\+/g, ' ') 将 + 号替换为空格（URL 编码标准）
    // split('=') 按第一个 = 分割键值
    const parts = param.replace(/\+/g, ' ').split('=');

    // --- 3.2 提取 key ---
    // shift() 取出第一个元素作为 key
    // ! 断言非空（因为至少有一个元素）
    let key = parts.shift()!;

    // --- 3.3 提取 value ---
    // join('=') 将剩余部分用 = 连接
    // 处理 value 中包含 = 的情况
    // 例如：'key=a=b=c' -> key='key', val='a=b=c'
    let val: any = parts.length > 0 ? parts.join('=') : undefined;

    // --- 3.4 URL 解码 ---
    key = decodeURIComponent(key);  // 解码 key
    val = val === undefined ? null : decodeURIComponent(val);  // 解码 value

    // --- 3.5 处理同名参数 ---
    if (ret[key] === undefined) {
      // 第一次出现，直接赋值
      ret[key] = val;
    } else if (Array.isArray(ret[key])) {
      // 已经是数组，追加值
      ret[key].push(val);
    } else {
      // 第二次出现，转换为数组
      ret[key] = [ret[key], val];
    }
  });

  return ret;
}

/**
 * 将对象序列化为查询字符串
 *
 * @param obj - 要序列化的对象
 * @returns 查询字符串（不包含 ?）
 *
 * 功能特性：
 * 1. 自动 URL 编码（encodeURIComponent）
 * 2. 对象类型的值会被 JSON.stringify 处理
 * 3. 返回格式：key1=value1&key2=value2
 *
 * 注意事项：
 * - 不处理数组（与 parseQuery 的数组支持不对称）
 * - 对象值会被序列化为 JSON 字符串
 *
 * @example
 * ```typescript
 * stringifyQuery({ name: '张三', age: 18 })
 * // 'name=%E5%BC%A0%E4%B8%89&age=18'
 *
 * stringifyQuery({ user: { id: 1, name: 'test' } })
 * // 'user=%7B%22id%22%3A1%2C%22name%22%3A%22test%22%7D'
 * ```
 */
export function stringifyQuery(obj: any): string {
  // 参数数组，存储 'key=value' 字符串
  const param: string[] = [];

  // 遍历对象的所有键
  Object.keys(obj).forEach((key) => {
    let value = obj[key];

    // 如果值是对象（不是 null），序列化为 JSON
    // 注意：这里会将数组也序列化为 JSON
    if (value && typeof value === 'object') {
      value = JSON.stringify(value);
    }

    // URL 编码并添加到参数数组
    // encodeURIComponent 会编码特殊字符：
    // - 空格 -> %20
    // - 中文 -> %E5%BC%A0...
    // - & -> %26
    // - = -> %3D
    param.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });

  // 用 & 连接所有参数
  return param.join('&');
}

/**
 * URI 编码（encodeURIComponent 的别名）
 *
 * @param uri - 要编码的字符串
 * @returns 编码后的字符串
 *
 * 提供更语义化的函数名
 */
export function uriEncode(uri: string) {
  return encodeURIComponent(uri);
}

/**
 * URI 解码（decodeURIComponent 的别名）
 *
 * @param uri - 要解码的字符串
 * @returns 解码后的字符串
 *
 * 提供更语义化的函数名
 */
export function uriDecode(uri: string) {
  return decodeURIComponent(uri);
}

/**
 * 为 URL 添加查询参数
 *
 * @param url - 原始 URL
 * @param params - 要添加的参数对象（可选）
 * @returns 添加参数后的 URL
 *
 * 功能特性：
 * 1. 智能判断使用 ? 还是 &
 * 2. 保留原有的 hash（#fragment）
 * 3. 如果 params 为空，返回原 URL
 *
 * 处理逻辑：
 * - URL 不含参数：使用 ? 连接
 * - URL 已有参数：使用 & 连接
 * - 保持 hash 在最后
 *
 * @example
 * ```typescript
 * withQueryParams('/page', { id: 1 })
 * // '/page?id=1'
 *
 * withQueryParams('/page?name=test', { id: 1 })
 * // '/page?name=test&id=1'
 *
 * withQueryParams('/page#section', { id: 1 })
 * // '/page?id=1#section'
 *
 * withQueryParams('/page?name=test#section', { id: 1 })
 * // '/page?name=test&id=1#section'
 * ```
 */
export function withQueryParams(url: string, params?: object) {
  // ===== 第1步：序列化参数 =====
  const queryStr = params ? stringifyQuery(params) : '';

  // 如果没有参数，直接返回原 URL
  if (queryStr === '') {
    return url;
  }

  // ===== 第2步：分离 hash =====
  // 将 URL 按 # 分割
  // urlSplit[0]: 主 URL 部分
  // urlSplit[1]: hash 部分（如果有）
  const urlSplit = url.split('#');
  const hash = urlSplit[1] ? `#${urlSplit[1]}` : '';  // 保留 # 符号
  const urlWithoutHash = urlSplit[0];  // 不含 hash 的 URL

  // ===== 第3步：智能拼接参数 =====
  // ~urlWithoutHash.indexOf('?') 的技巧：
  // - indexOf('?') 未找到返回 -1
  // - ~ 是按位取反：~(-1) = 0 (falsy)，~(>=0) 为非零 (truthy)
  // - 相当于：indexOf('?') !== -1
  //
  // 如果 URL 已有 ?，使用 &；否则使用 ?
  return `${urlWithoutHash}${~urlWithoutHash.indexOf('?') ? '&' : '?'}${queryStr}${hash}`;
}
