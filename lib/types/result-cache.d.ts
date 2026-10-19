export declare const MODEL_RESULT_CHARACTERS = 12000;
/** Preview length for JSON results, which also get a structural outline. */
export declare const JSON_PREVIEW_CHARACTERS = 4000;
export declare const MAX_CACHED_RESULT_CHARACTERS = 1000000;
export declare const MAX_CACHED_RESULTS = 8;
export declare const MAX_PROJECTED_ITEMS = 200;
export declare const RESULT_PAGE_META_KEY = "dsh-vercel/result-page";
export interface ResultPage {
    resultId: string;
    text: string;
    offset: number;
    nextOffset: number | null;
    totalCharacters: number;
}
export interface ProjectedPage {
    resultId: string;
    path: string;
    text: string;
    offset: number;
    nextOffset: number | null;
    totalItems: number;
}
/** Compact structure summary: top-level keys, arrays with lengths and the fields of their items. */
export declare function outlineJson(value: unknown): string;
/** Parse result text that is itself a JSON document; anything else stays plain text. */
export declare function parseJsonText(text: string): unknown;
export declare class AgentResultCache {
    private owners;
    /** Keep the complete rendered text (and parsed JSON) when it fits; evict oldest entries to retain a fixed budget. */
    put(owner: object, text: string, json?: unknown): string | undefined;
    /** Bounds are JS string characters, consistent with the schema/output budgets. */
    read(owner: object, resultId: string, offset?: number, limit?: number): ResultPage | undefined;
    /**
     * Page through an array inside a cached JSON result, keeping only the given
     * fields of each item. offset/limit count items; the page stops early rather
     * than exceed the model text budget.
     */
    project(owner: object, resultId: string, options: {
        path?: string;
        fields?: string[];
        offset?: number;
        limit?: number;
    }): ProjectedPage | undefined;
    clear(owner?: object): void;
}
