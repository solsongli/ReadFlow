export declare const WORKBENCH_TEXT_SCALES: readonly [85, 90, 95, 100, 110, 120, 130];
export type WorkbenchFont = "default" | "sans" | "serif" | "kai" | "custom";
export interface WorkbenchAppearance {
    font: WorkbenchFont;
    family?: string;
    textScale: number;
}
export declare function validWorkbenchFont(value: unknown): value is WorkbenchFont;
export declare function validWorkbenchFontFamily(value: unknown): value is string;
export declare function validWorkbenchAppearance(value: unknown): value is WorkbenchAppearance;
export declare function workbenchFontStack(value: WorkbenchAppearance): string;
//# sourceMappingURL=workbench-typography.d.ts.map