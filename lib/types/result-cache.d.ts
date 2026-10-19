export declare const MODEL_RESULT_CHARACTERS = 12000;
export declare const MAX_CACHED_RESULT_CHARACTERS = 1000000;
export declare const MAX_CACHED_RESULTS = 8;
export declare const RESULT_PAGE_META_KEY = "dsh-vercel/result-page";
export interface ResultPage {
    resultId: string;
    text: string;
    offset: number;
    nextOffset: number | null;
    totalCharacters: number;
}
export declare class AgentResultCache {
    private owners;
    /** Keep the complete rendered text when it fits; evict oldest entries to retain a fixed budget. */
    put(owner: object, text: string): string | undefined;
    /** Bounds are JS string characters, consistent with the schema/output budgets. */
    read(owner: object, resultId: string, offset?: number, limit?: number): ResultPage | undefined;
    clear(owner?: object): void;
}
