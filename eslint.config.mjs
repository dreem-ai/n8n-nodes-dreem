import { config } from '@n8n/node-cli/eslint';

export default [
	...config,
	{
		rules: {
			'n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options': 'off',
			'n8n-nodes-base/node-param-display-name-wrong-for-dynamic-multi-options': 'off',
			'n8n-nodes-base/node-param-description-wrong-for-dynamic-options': 'off',
			'n8n-nodes-base/node-param-description-wrong-for-dynamic-multi-options': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
];
