module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    project: false
  },
  plugins: [
    "@typescript-eslint",
    "import",
    "promise",
    "unicorn"
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:promise/recommended",
    "plugin:unicorn/recommended",
    "prettier"
  ],
  rules: {
    "unicorn/prefer-module": "off",
    "unicorn/prevent-abbreviations": "off",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "promise/always-return": "off"
  }
};
