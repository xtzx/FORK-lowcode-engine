import {IPublicModelPluginContext} from '../../../types/src';

export const setterRegistry = (ctx: IPublicModelPluginContext) => {
    return {
        init() {
            const {config} = ctx;

            if (config.get('disableDefaultSetters')) return;

            const builtinSetters = require('@alilc/lowcode-engine-ext')?.setters;

            if (builtinSetters) {
                ctx.setters.registerSetter(builtinSetters);
            }
        },
    };
};

setterRegistry.pluginName = '___setter_registry___';
