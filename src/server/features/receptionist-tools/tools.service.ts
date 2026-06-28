/**
 * Receptionist tools — channel-agnostic business logic the voice provider (and the simulator)
 * call. The catalog, handlers, and dispatch now live in `tools.registry.ts` (single source of
 * truth); this module re-exports the dispatch entrypoint so existing import paths keep working.
 */

export {
  runTool,
  TOOL_REGISTRY,
  builtinToolDefs,
  toolCatalog,
  type ToolDef,
  type ToolEntry,
} from "./tools.registry";
