import adapter from '../adapter';

/**
 * 保存在 window.__appContext;
 * 存在一些潜在的问题，如全局污染和在多窗口或多框架环境中可能导致的冲突
 */
export default function contextFactory() {
    const {createContext} = adapter.getRuntime();

    let context = (window as any).__appContext;

    if (!context) {
        context = createContext({});
        (window as any).__appContext = context;
    }

    return context;
}



// contextFactory.ts
// const contextFactory = (() => {
//   let context = null;

//   return () => {
//       if (!context) {
//           context = createContext({});
//       }
//       return context;
//   };
// })();

// export default contextFactory;