module.exports = {
  extends: ['eslint-config-salesforce-typescript', 'plugin:sf-plugin/recommended'],
  root: true,
  rules: {
    header: 'off',
    devDependencies: 'off',
    'spaced-comment': 'off',
    'no-underscore-dangle': 'off',
    'jsdoc/tag-lines': 'off',
    'jsdoc/check-indentation': 'off',
    'jsdoc/check-alignment': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
  },
};
