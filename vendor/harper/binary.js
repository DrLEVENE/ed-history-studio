import { BinaryModuleImpl } from "./BinaryModule-DMhzYB6c.js";
// ../../harper-wasm/pkg/harper_wasm_bg.wasm?no-inline
var harper_wasm_bg_default = new URL("harper_wasm_bg.wasm", import.meta.url).href;
// src/binaries/binary.ts
/** A version of the Harper WebAssembly binary stored as its own module. */
var binary = /*@__PURE__*/ BinaryModuleImpl.create(harper_wasm_bg_default, "full");
export { binary };
