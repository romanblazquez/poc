import type { Tree } from '@nx/devkit';
import type { Linter } from 'eslint';
import type { AddLintingGeneratorSchema } from '../schema';
type EslintExtensionSchema = {
    prefix: string;
};
/**
 * @deprecated Use tools from `@nx/eslint/src/generators/utils/eslint-file` instead. It will be removed in Nx v22.
 */
export declare const extendAngularEslintJson: (json: Linter.LegacyConfig, options: EslintExtensionSchema) => Linter.LegacyConfig;
/**
 * @deprecated Use {@link extendAngularEslintJson} instead. It will be removed in Nx v22.
 */
export declare function createEsLintConfiguration(tree: Tree, options: AddLintingGeneratorSchema): void;
export {};
//# sourceMappingURL=create-eslint-configuration.d.ts.map