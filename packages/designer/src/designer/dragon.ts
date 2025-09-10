import { obx, makeObservable, IEventBus, createModuleEventBus } from '@alilc/lowcode-editor-core';
import {
    IPublicTypeDragNodeObject,
    IPublicTypeDragAnyObject,
    IPublicEnumDragObjectType,
    IPublicTypeDragNodeDataObject,
    IPublicModelDragObject,
    IPublicModelNode,
    IPublicModelDragon,
    IPublicModelLocateEvent,
    IPublicModelSensor,
} from '@alilc/lowcode-types';
import { setNativeSelection, cursor } from '@alilc/lowcode-utils';
import { INode, Node } from '../document';
import { ISimulatorHost, isSimulatorHost } from '../simulator';
import { IDesigner } from './designer';
import { makeEventsHandler } from '../utils/misc';

export interface ILocateEvent extends IPublicModelLocateEvent {
    readonly type: 'LocateEvent';

    /**
     * 激活的感应器
     */
    sensor?: IPublicModelSensor;
}

/**
 * @deprecated use same function in @alilc/lowcode-utils
 */
export function isDragNodeObject(obj: any): obj is IPublicTypeDragNodeObject {
    return obj && obj.type === IPublicEnumDragObjectType.Node;
}

/**
 * @deprecated use same function in @alilc/lowcode-utils
 */
export function isDragNodeDataObject(obj: any): obj is IPublicTypeDragNodeDataObject {
    return obj && obj.type === IPublicEnumDragObjectType.NodeData;
}

/**
 * @deprecated use same function in @alilc/lowcode-utils
 */
export function isDragAnyObject(obj: any): obj is IPublicTypeDragAnyObject {
    return obj && obj.type !== IPublicEnumDragObjectType.NodeData && obj.type !== IPublicEnumDragObjectType.Node;
}

export function isLocateEvent(e: any): e is ILocateEvent {
    return e && e.type === 'LocateEvent';
}

const SHAKE_DISTANCE = 4;

/**
 * mouse shake check
 */
export function isShaken(e1: MouseEvent | DragEvent, e2: MouseEvent | DragEvent): boolean {
    if ((e1 as any).shaken) {
        return true;
    }
    if (e1.target !== e2.target) {
        return true;
    }
    return Math.pow(e1.clientY - e2.clientY, 2) + Math.pow(e1.clientX - e2.clientX, 2) > SHAKE_DISTANCE;
}

export function isInvalidPoint(e: any, last: any): boolean {
    return (
        e.clientX === 0 &&
        e.clientY === 0 &&
        last &&
        (Math.abs(last.clientX - e.clientX) > 5 || Math.abs(last.clientY - e.clientY) > 5)
    );
}

export function isSameAs(e1: MouseEvent | DragEvent, e2: MouseEvent | DragEvent): boolean {
    return e1.clientY === e2.clientY && e1.clientX === e2.clientX;
}

export function setShaken(e: any) {
    e.shaken = true;
}

function getSourceSensor(dragObject: IPublicModelDragObject): ISimulatorHost | null {
    if (!isDragNodeObject(dragObject)) {
        return null;
    }
    return dragObject.nodes[0]?.document?.simulator || null;
}

function isDragEvent(e: any): e is DragEvent {
    return e?.type?.startsWith('drag');
}

export interface IDragon extends IPublicModelDragon<INode, ILocateEvent> {
    emitter: IEventBus;
}

/**
 * Drag-on 拖拽引擎
 */
export class Dragon implements IDragon {
    private sensors: IPublicModelSensor[] = [];

    private nodeInstPointerEvents: boolean;

    key = Math.random();

    /**
     * current active sensor, 可用于感应区高亮
     */
    @obx.ref private _activeSensor: IPublicModelSensor | undefined;

    get activeSensor(): IPublicModelSensor | undefined {
        return this._activeSensor;
    }

    @obx.ref private _dragging = false;

    @obx.ref private _canDrop = false;

    get dragging(): boolean {
        return this._dragging;
    }

    viewName: string | undefined;

    emitter: IEventBus = createModuleEventBus('Dragon');

    constructor(readonly designer: IDesigner) {
        makeObservable(this);
        this.viewName = designer.viewName;
    }

    /**
     * Quick listen a shell(container element) drag behavior
     * @param shell container element
     * @param boost boost got a drag object
     */
    from(shell: Element, boost: (e: MouseEvent) => IPublicModelDragObject | null): any {
        const mousedown = (e: MouseEvent) => {
            // ESC or RightClick
            if (e.which === 3 || e.button === 2) {
                return;
            }

            // Get a new node to be dragged
            const dragObject = boost(e);
            if (!dragObject) {
                return;
            }

            this.boost(dragObject, e);
        };
        shell.addEventListener('mousedown', mousedown as any);
        return () => {
            shell.removeEventListener('mousedown', mousedown as any);
        };
    }

    /**
     * boost your dragObject for dragging(flying) 发射拖拽对象
     * 这是 Dragon 拖拽引擎的核心方法，负责统一管理所有类型的拖拽操作
     *
     * @param dragObject 拖拽对象 - 可能是已存在的节点(Node)或新组件数据(NodeData)
     * @param boostEvent 拖拽初始时事件 - 鼠标或拖拽事件
     * @param fromRglNode 可选的RGL节点 - 如果从 React Grid Layout 节点开始拖拽
     */
    boost(
        dragObject: IPublicModelDragObject,
        boostEvent: MouseEvent | DragEvent,
        fromRglNode?: INode | IPublicModelNode,
    ) {
        // ==================== 第一阶段：初始化和环境准备 ====================

        const { designer } = this; // 获取设计器实例，提供对项目、文档、选择器等的访问
        const masterSensors = this.getMasterSensors(); // 获取所有活跃的主传感器列表（通常是模拟器实例）
        const handleEvents = makeEventsHandler(boostEvent, masterSensors); // 创建跨文档事件处理器，支持主文档和iframe

        // 判断是否为"新手"拖拽（从组件库拖入新组件）
        // 逻辑：如果dragObject.type === 'NodeData'，则isDragNodeObject返回false，newBie为true
        //      如果dragObject.type === 'Node'，则isDragNodeObject返回true，newBie为false
        const newBie = !isDragNodeObject(dragObject);

        // 判断是否需要强制复制状态
        // 当拖拽对象包含插槽(Slot)节点时，强制进行复制操作而非移动
        const forceCopyState =
            isDragNodeObject(dragObject) && // 确保是节点对象
            dragObject.nodes.some((node: Node | IPublicModelNode) =>
                // 兼容函数和属性两种 isSlot 的实现方式
                (typeof node.isSlot === 'function' ? node.isSlot() : node.isSlot));

        // 判断是否来自HTML5原生拖拽API
        const isBoostFromDragAPI = isDragEvent(boostEvent);

        let lastSensor: IPublicModelSensor | undefined; // 记录上一个活跃的传感器，用于传感器切换时的清理

        this._dragging = false; // 初始化拖拽状态为未开始

        // ==================== 第二阶段：内部核心函数定义 ====================

        /**
         * getRGL - 获取React Grid Layout相关信息
         * 用于判断当前鼠标位置是否在RGL容器内，并获取相关节点信息
         */
        const getRGL = (e: MouseEvent | DragEvent) => {
            const locateEvent = createLocateEvent(e); // 创建标准化的定位事件对象
            const sensor = chooseSensor(locateEvent); // 根据事件位置选择合适的传感器
            if (!sensor || !sensor.getNodeInstanceFromElement) return {}; // 传感器无效或不支持元素查找

            // 从DOM元素获取对应的节点实例
            const nodeInst = sensor.getNodeInstanceFromElement(e.target as Element);
            return (nodeInst?.node as any)?.getRGL?.() || {}; // 获取RGL相关信息，失败则返回空对象
        };

        /**
         * checkesc - ESC键取消拖拽处理器
         * 监听ESC键按下事件，提供取消拖拽的快捷方式
         */
        const checkesc = (e: KeyboardEvent) => {
            if (e.keyCode === 27) { // 27是ESC键的keyCode
                designer.clearLocation(); // 清除设计器中的定位和高亮信息
                over(); // 调用结束函数，清理拖拽状态
            }
        };

        /**
         * checkcopy - 复制状态检查和设置
         * 根据键盘修饰键(Alt/Ctrl)动态切换拖拽的复制/移动模式
         */
        let copy = false; // 本地复制标记
        const checkcopy = (e: MouseEvent | DragEvent | KeyboardEvent) => {
            /* istanbul ignore next */
            // 处理HTML5原生拖拽API的情况
            if (isDragEvent(e) && e.dataTransfer) {
                if (newBie || forceCopyState) { // 新组件或插槽节点强制复制
                    e.dataTransfer.dropEffect = 'copy'; // 设置原生拖拽视觉效果为复制
                }
                return;
            }

            // 新组件默认就是复制，无需处理
            if (newBie) {
                return;
            }

            // 检查修饰键状态
            if (e.altKey || e.ctrlKey) { // Alt或Ctrl键按下
                copy = true; // 设置本地复制标记
                this.setCopyState(true); // 更新全局拖拽引擎的复制状态
                /* istanbul ignore next */
                if (isDragEvent(e) && e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy'; // 原生拖拽设置复制效果
                }
            } else { // 修饰键未按下
                copy = false; // 设置为移动模式
                if (!forceCopyState) { // 非强制复制情况下
                    this.setCopyState(false); // 更新为移动状态
                    /* istanbul ignore next */
                    if (isDragEvent(e) && e.dataTransfer) {
                        e.dataTransfer.dropEffect = 'move'; // 原生拖拽设置移动效果
                    }
                }
            }
        };

        /**
         * drag - 拖拽过程中的核心处理函数
         * 处理鼠标移动过程中的定位、传感器选择、RGL特殊逻辑等
         */
        let lastArrive: any; // 缓存上一次鼠标事件，用于性能优化
        const drag = (e: MouseEvent | DragEvent) => {
            // FIXME: donot setcopy when: newbie & no location
            checkcopy(e); // 检查并更新复制状态

            // 性能优化：过滤掉无效的鼠标坐标点
            if (isInvalidPoint(e, lastArrive)) return;

            // 性能优化：避免处理相同位置的重复事件
            if (lastArrive && isSameAs(e, lastArrive)) {
                lastArrive = e; // 更新缓存但不继续处理
                return;
            }
            lastArrive = e; // 更新事件缓存

            const rglInfo = getRGL(e) as any;
            const { isRGL, rglNode } = rglInfo; // 检查当前位置的RGL信息
            const locateEvent = createLocateEvent(e); // 创建标准化定位事件
            const sensor = chooseSensor(locateEvent); // 选择最合适的传感器

            /* istanbul ignore next */
            // React Grid Layout 特殊处理逻辑
            if (isRGL) {
                // debugger; // 开发调试断点（生产环境下已禁用）

                // 禁用被拖拽元素的鼠标事件响应，防止事件被拖拽元素本身拦截
                const nodeInst = dragObject.nodes?.[0]?.getDOMNode();
                if (nodeInst && nodeInst.style) {
                    this.nodeInstPointerEvents = true; // 标记已修改pointer-events
                    nodeInst.style.pointerEvents = 'none'; // 设置为不响应鼠标事件
                }

                // 通知RGL系统停止休眠状态
                this.emitter.emit('rgl.sleeping', false);

                // 检查是否从同一个RGL节点内拖拽（避免自己拖拽自己）
                if (fromRglNode && fromRglNode.id === rglNode.id) {
                    designer.clearLocation(); // 清除位置信息
                    this.clearState(); // 清除拖拽状态
                    this.emitter.emit('drag', locateEvent); // 发送拖拽事件
                    return;
                }

                // 尝试在目标位置进行定位，判断是否可以放置
                this._canDrop = !!sensor?.locate(locateEvent);
                if (this._canDrop) {
                    // 可以放置：显示RGL占位符
                    this.emitter.emit('rgl.add.placeholder', {
                        rglNode, // 目标RGL节点
                        fromRglNode, // 来源RGL节点
                        node: locateEvent.dragObject?.nodes?.[0], // 被拖拽的节点
                        event: e, // 原始事件
                    });
                    designer.clearLocation();
                    this.clearState();
                    this.emitter.emit('drag', locateEvent);
                    return;
                }
            } else {
                // 非RGL区域的处理
                this._canDrop = false; // 设置为不可放置
                this.emitter.emit('rgl.remove.placeholder'); // 移除RGL占位符
                this.emitter.emit('rgl.sleeping', true); // RGL系统进入休眠
            }
            // 🎯 常规的传感器定位逻辑（核心容器判断入口）
            if (sensor) {
                sensor.fixEvent(locateEvent); // 让传感器修正事件对象（如坐标转换）

                // 🔥 关键调用：这里触发容器判断逻辑！
                // sensor.locate() 会调用 BuiltinSimulatorHost.locate()
                // 最终调用 getDropContainer() 和 handleAccept() 来判断容器
                sensor.locate(locateEvent); // 执行定位，更新位置信息和视觉反馈
            } else {
                designer.clearLocation(); // 没有传感器时清除位置信息
            }

            this.emitter.emit('drag', locateEvent); // 发送拖拽进行事件
        };

        /**
         * dragstart - 拖拽开始处理函数
         * 初始化拖拽状态，设置全局状态，注册必要的事件监听器
         */
        const dragstart = () => {
            this._dragging = true; // 设置拖拽状态为进行中
            setShaken(boostEvent); // 标记初始事件已经发生抖动
            const locateEvent = createLocateEvent(boostEvent); // 创建初始定位事件

            // 根据拖拽类型设置初始复制状态
            if (newBie || forceCopyState) {
                this.setCopyState(true); // 新组件或插槽：默认复制
            } else {
                chooseSensor(locateEvent); // 已有组件：选择传感器
            }

            this.setDraggingState(true); // 设置全局拖拽状态（影响光标样式等）

            // 注册ESC键取消功能（仅限非原生拖拽）
            if (!isBoostFromDragAPI) {
                handleEvents((doc) => {
                    doc.addEventListener('keydown', checkesc, false);
                });
            }

            this.emitter.emit('dragstart', locateEvent); // 发送拖拽开始事件
        };

        /**
         * move - 鼠标移动处理函数
         * 路由鼠标移动事件，决定是开始拖拽还是继续拖拽
         */
        // route: drag-move
        const move = (e: MouseEvent | DragEvent) => {
            /* istanbul ignore next */
            // 原生拖拽API需要阻止默认行为
            if (isBoostFromDragAPI) {
                e.preventDefault();
            }

            // 如果已经在拖拽状态，直接处理拖拽移动
            if (this._dragging) {
                drag(e); // 调用拖拽处理函数
                return;
            }

            // 首次移动：检查是否达到抖动阈值（防止误触发拖拽）
            if (isShaken(boostEvent, e)) {
                dragstart(); // 开始拖拽
                drag(e); // 处理当前移动
            }
            // 未达到抖动阈值：继续等待更大的移动
        };

        /**
         * drop - HTML5原生拖拽放置事件处理
         * 处理原生dragdrop API的drop事件
         */
        let didDrop = true; // 标记是否真正发生了放置
        /* istanbul ignore next */
        const drop = (e: DragEvent) => {
            e.preventDefault(); // 阻止浏览器默认处理
            e.stopPropagation(); // 阻止事件冒泡
            didDrop = true; // 标记放置已发生
        };

        // end-tail drag process
        const over = (e?: any) => {
            // 禁止被拖拽元素的阻断
            if (this.nodeInstPointerEvents) {
                const nodeInst = dragObject.nodes?.[0]?.getDOMNode();
                if (nodeInst && nodeInst.style) {
                    nodeInst.style.pointerEvents = '';
                }
                this.nodeInstPointerEvents = false;
            }

            // 发送drop事件
            if (e) {
                const rglInfo = getRGL(e) as any;
            const { isRGL, rglNode } = rglInfo;
                /* istanbul ignore next */
                if (isRGL && this._canDrop && this._dragging) {
                    const tarNode = dragObject.nodes?.[0];
                    if (tarNode && rglNode.id !== tarNode.id) {
                        // 避免死循环
                        this.emitter.emit('rgl.drop', {
                            rglNode,
                            node: tarNode,
                        });
                        const selection = designer.project.currentDocument?.selection;
                        tarNode && selection?.select(tarNode.id);
                    }
                }
            }

            // 清理RGL占位符
            this.emitter.emit('rgl.remove.placeholder');

            /* istanbul ignore next */
            if (e && isDragEvent(e)) {
                e.preventDefault();
            }

            // 停用最后使用的传感器
            if (lastSensor) {
                lastSensor.deactiveSensor();
            }

            /* istanbul ignore next */
            // 根据拖拽类型进行不同的清理工作
            if (isBoostFromDragAPI) {
                if (!didDrop) {                                  // 原生拖拽但未成功放置
                    designer.clearLocation();
                }
            } else {
                this.setNativeSelection(true);                   // 恢复浏览器原生文本选择
            }

            this.clearState();                                  // 清除所有拖拽相关状态

            let exception;
            // 发送拖拽结束事件
            if (this._dragging) {
                this._dragging = false;                           // 重置拖拽状态
                try {
                    this.emitter.emit('dragend', { dragObject, copy }); // 发送结束事件
                } catch (ex) /* istanbul ignore next */ {
                    exception = ex;                               // 捕获异常但延后抛出
                }
            }

            designer.clearLocation();                            // 清除设计器位置信息

            // 移除所有注册的事件监听器
            handleEvents((doc) => {
                /* istanbul ignore next */
                if (isBoostFromDragAPI) {
                    // 移除原生拖拽事件监听器
                    doc.removeEventListener('dragover', move, true);
                    doc.removeEventListener('dragend', over, true);
                    doc.removeEventListener('drop', drop, true);
                } else {
                    // 移除鼠标事件监听器
                    doc.removeEventListener('mousemove', move, true);
                    doc.removeEventListener('mouseup', over, true);
                }
                // 移除通用事件监听器
                doc.removeEventListener('mousedown', over, true);
                doc.removeEventListener('keydown', checkesc, false);
                doc.removeEventListener('keydown', checkcopy, false);
                doc.removeEventListener('keyup', checkcopy, false);
            });

            /* istanbul ignore next */
            if (exception) {
                throw exception;                                 // 重新抛出之前捕获的异常
            }
        };

        /**
         * createLocateEvent - 创建标准化的定位事件对象
         * 将原始的鼠标/拖拽事件转换为引擎内部使用的定位事件
         * 处理跨iframe的坐标转换
         */
        // create drag locate event
        const createLocateEvent = (e: MouseEvent | DragEvent): ILocateEvent => {
            const evt: any = {
                type: 'LocateEvent',                             // 事件类型标识
                dragObject,                                      // 关联的拖拽对象
                target: e.target,                               // 事件目标元素
                originalEvent: e,                               // 保留原始事件引用
            };

            const sourceDocument = e.view?.document;            // 获取事件来源的文档对象

            // 判断事件来源：主文档 vs iframe文档
            if (!sourceDocument || sourceDocument === document) {
                // 事件来自主文档：直接使用客户端坐标
                evt.globalX = e.clientX;
                evt.globalY = e.clientY;
            } /* istanbul ignore next */ else {
                // 事件来自iframe（模拟器沙箱）：需要坐标转换
                let srcSim: ISimulatorHost | undefined;
                const lastSim = lastSensor && isSimulatorHost(lastSensor) ? lastSensor : null;

                // 查找事件来源的模拟器实例
                if (lastSim && lastSim.contentDocument === sourceDocument) {
                    srcSim = lastSim;                            // 使用上次的模拟器
                } else {
                    // 在所有主传感器中查找匹配的模拟器
                    srcSim = masterSensors.find((sim) => (sim as any).contentDocument === sourceDocument);
                    if (!srcSim && lastSim) {
                        srcSim = lastSim;                        // 找不到时回退到上次的模拟器
                    }
                }

                if (srcSim) {
                    // 通过模拟器的视口进行坐标转换
                    const g = srcSim.viewport.toGlobalPoint(e);
                    evt.globalX = g.clientX;                      // 转换后的全局X坐标
                    evt.globalY = g.clientY;                      // 转换后的全局Y坐标
                    evt.canvasX = e.clientX;                      // iframe内的画布X坐标
                    evt.canvasY = e.clientY;                      // iframe内的画布Y坐标
                    evt.sensor = srcSim;                          // 关联模拟器传感器
                } else {
                    // 异常情况的兜底处理（理论上不会发生）
                    evt.globalX = e.clientX;
                    evt.globalY = e.clientY;
                }
            }
            return evt;
        };

        /**
         * chooseSensor - 智能传感器选择函数
         * 根据定位事件选择最合适的传感器来处理拖拽
         * 支持传感器之间的动态切换
         */
        const sourceSensor = getSourceSensor(dragObject);       // 获取拖拽对象的原始传感器
        /* istanbul ignore next */
        const chooseSensor = (e: ILocateEvent) => {
            // 合并所有可用传感器（注意：this.sensors在拖拽过程中可能会变化）
            const sensors: IPublicModelSensor[] = this.sensors.concat(masterSensors as IPublicModelSensor[]);

            // 传感器选择策略（按优先级）：
            // 1. 事件已关联传感器且鼠标在其区域内
            // 2. 从所有传感器中找到可用且鼠标在其区域内的传感器
            let sensor =
                e.sensor && e.sensor.isEnter(e) ? e.sensor :
                sensors.find((s) => s.sensorAvailable && s.isEnter(e));

            if (!sensor) {
                // 没有找到合适传感器时的回退策略
                // TODO: enter some area like componentspanel cancel
                if (lastSensor) {
                    sensor = lastSensor;                          // 回退到上一个传感器
                } else if (e.sensor) {
                    sensor = e.sensor;                            // 使用事件自带的传感器
                } else if (sourceSensor) {
                    sensor = sourceSensor as any;                        // 使用拖拽对象的来源传感器
                }
            }

            // 处理传感器切换
            if (sensor !== lastSensor) {
                if (lastSensor) {
                    lastSensor.deactiveSensor();                  // 停用旧传感器
                }
                lastSensor = sensor;                              // 更新当前活跃传感器
            }

            if (sensor) {
                e.sensor = sensor;                                // 将传感器关联到事件
                sensor.fixEvent(e);                               // 让传感器修正事件（坐标转换等）
            }

            this._activeSensor = sensor;                          // 更新引擎的活跃传感器
            return sensor;
        };

        // ==================== 第三阶段：主流程执行 ====================

        /* istanbul ignore next */
        // HTML5原生拖拽API的特殊处理
        if (isDragEvent(boostEvent)) {                      // 如果是原生拖拽事件
            const { dataTransfer } = boostEvent;

            if (dataTransfer) {
                dataTransfer.effectAllowed = 'all';             // 允许所有拖拽效果（copy/move/link）

                try {
                    // 设置拖拽数据（某些浏览器要求设置数据才能正常工作）
                    dataTransfer.setData('application/json', '{}');
                } catch (ex) {
                    // 忽略设置失败（某些浏览器可能限制setData）
                }
            }

            dragstart();                                        // 原生拖拽：立即开始拖拽
        } else {
            this.setNativeSelection(false);                     // 鼠标拖拽：禁用文本选择
        }

        // 注册核心事件监听器
        handleEvents((doc) => {
            /* istanbul ignore next */
            if (isBoostFromDragAPI) {
                // HTML5原生拖拽事件
                doc.addEventListener('dragover', move, true);     // 拖拽经过事件
                didDrop = false;                                 // 重置放置标记
                doc.addEventListener('drop', drop, true);         // 拖拽放置事件
                doc.addEventListener('dragend', over, true);      // 拖拽结束事件
            } else {
                // 鼠标模拟拖拽事件
                doc.addEventListener('mousemove', move, true);    // 鼠标移动事件
                doc.addEventListener('mouseup', over, true);      // 鼠标释放事件
            }
            doc.addEventListener('mousedown', over, true);        // 鼠标按下事件（用于取消拖拽）
        });

        // future think: drag things from browser-out or a iframe-pane
        // 未来扩展：支持从浏览器外部或其他iframe拖拽

        // 为非新组件且非原生拖拽添加复制功能的键盘监听
        if (!newBie && !isBoostFromDragAPI) {
            handleEvents((doc) => {
                doc.addEventListener('keydown', checkcopy, false); // 监听键盘按下
                doc.addEventListener('keyup', checkcopy, false);   // 监听键盘释放
            });
        }
    }

    /* istanbul ignore next */
    private getMasterSensors(): ISimulatorHost[] {
        return Array.from(
            new Set(
                this.designer.project.documents
                    .map((doc) => {
                        if (doc.active && (doc as any).simulator?.sensorAvailable) {
                            return (doc as any).simulator;
                        }
                        return null;
                    })
                    .filter(Boolean) as any,
            ),
        );
    }

    private getSimulators() {
        return new Set(this.designer.project.documents.map((doc) => doc.simulator));
    }

    // #region ======== drag and drop helpers ============
    private setNativeSelection(enableFlag: boolean) {
        setNativeSelection(enableFlag);
        this.getSimulators().forEach((sim) => {
            sim?.setNativeSelection(enableFlag);
        });
    }

    /**
     * 设置拖拽态
     */
    private setDraggingState(state: boolean) {
        cursor.setDragging(state);
        this.getSimulators().forEach((sim) => {
            sim?.setDraggingState(state);
        });
    }

    /**
     * 设置拷贝态
     */
    private setCopyState(state: boolean) {
        cursor.setCopy(state);
        this.getSimulators().forEach((sim) => {
            sim?.setCopyState(state);
        });
    }

    /**
     * 清除所有态：拖拽态、拷贝态
     */
    private clearState() {
        cursor.release();
        this.getSimulators().forEach((sim) => {
            sim?.clearState();
        });
    }
    // #endregion

    /**
     * 添加投放感应区
     */
    addSensor(sensor: any) {
        this.sensors.push(sensor);
    }

    /**
     * 移除投放感应
     */
    removeSensor(sensor: any) {
        const i = this.sensors.indexOf(sensor);
        if (i > -1) {
            this.sensors.splice(i, 1);
        }
    }

    onDragstart(func: (e: ILocateEvent) => any) {
        this.emitter.on('dragstart', func);
        return () => {
            this.emitter.removeListener('dragstart', func);
        };
    }

    onDrag(func: (e: ILocateEvent) => any) {
        this.emitter.on('drag', func);
        return () => {
            this.emitter.removeListener('drag', func);
        };
    }

    onDragend(func: (x: {dragObject: IPublicModelDragObject; copy: boolean}) => any) {
        this.emitter.on('dragend', func);
        return () => {
            this.emitter.removeListener('dragend', func);
        };
    }
}
