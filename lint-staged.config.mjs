export default {
  '*.{js,ts,jsx,tsx}': ['prettier --write', 'eslint --fix'],
  '*.{json,md,mdx}': ['prettier --write'],
};
