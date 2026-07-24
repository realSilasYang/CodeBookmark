/**
 * 统一 TypeScript、维护脚本和测试代码的 ESLint 规则，并按运行环境声明可用的全局变量。
 * 项目以零警告为通过条件；生成目录、第三方资源和打包产物不参与源码检查。
 */
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-empty": "off"
    }
  }
);
