/**
 * Model-facing projections of remote MCP input schemas.
 *
 * The remote catalog keeps every definition verbatim (catalog export, describe).
 * Only the schema declared to the model is reduced: annotations that do not
 * change which arguments are valid are dropped, nested prose is removed, and
 * very large top-level properties are collapsed to a typed stub whose full
 * structure is available through the describe helper. The Vercel server still
 * validates every call against its own schema.
 */
/** Slimmed schemas above this many characters have their large properties collapsed. */
export declare const OVERSIZED_SCHEMA_CHARACTERS = 6000;
/** Upper bound for one describe response. */
export declare const DESCRIBE_CHARACTERS = 6000;
/** Drop validation-neutral annotations and nested descriptions; property names and constraints are kept. */
export declare function slimSchema(schema: Record<string, unknown>): Record<string, unknown>;
/**
 * Collapse the largest properties, biggest first, until the schema fits
 * `targetCharacters`. An object property is reduced inside first (its own
 * largest children), so a single wrapper such as `requestBody` keeps its small
 * fields inline. Required names, property order and small properties stay intact.
 */
export declare function collapseSchema(schema: Record<string, unknown>, describeTool: string, targetCharacters?: number, prefix?: string): {
    schema: Record<string, unknown>;
    collapsed: string[];
};
/** The parameters actually declared to the model for one remote tool. */
export declare function modelParameters(name: string, description: string, inputSchema: Record<string, unknown>, describeTool: string): {
    parameters: Record<string, unknown>;
    collapsed: string[];
};
/**
 * Resolve a dot path through `properties`, array `items` and `anyOf`/`oneOf`
 * options of the original (unslimmed) schema. Numeric segments select an option.
 */
export declare function schemaAtPath(schema: Record<string, unknown>, dottedPath: string): Record<string, unknown> | undefined;
/** Text for one describe call: the subschema, with large children collapsed when it exceeds the budget. */
export declare function describeSchema(schema: Record<string, unknown>, basePath: string, describeTool: string): string;
