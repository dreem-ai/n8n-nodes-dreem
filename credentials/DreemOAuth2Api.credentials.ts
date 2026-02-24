import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class DreemOAuth2Api implements ICredentialType {
	name = 'dreemOAuth2Api';
	extends = ['oAuth2Api'];
	icon = 'file:dreem.svg' as const;
	displayName = 'Dreem OAuth2 API';
	documentationUrl = 'https://docs.dreem.ai/integrations/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'pkce',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'hidden',
			default: 'dreem',
			description: 'The OAuth2 Client ID for n8n integration. Pre-configured for standard n8n usage.',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'hidden',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Not required - n8n uses PKCE (public client) for enhanced security',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: `${process.env.DREEM_ACCOUNTS_API_BASE_URL || 'https://accounts.dreem.ai'}/connect/authorize`,
			required: true,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: `${process.env.DREEM_ACCOUNTS_API_BASE_URL || 'https://accounts.dreem.ai'}/connect/token`,
			required: true,
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'options',
			options: [
				{
					name: 'Full Access',
					value: 'openid offline_access public_api_scope',
					description: 'Complete access to all Public API features',
				},
				{
					name: 'Generation Only',
					value: 'openid offline_access generations:write generations:read requests:read',
					description: 'Create and monitor AI generations',
				},
				{
					name: 'Read Only',
					value: 'openid offline_access generations:read talents:read shots:read requests:read',
					description: 'View resources and generation history',
				},
				{
					name: 'Custom',
					value: 'custom',
					description: 'Specify custom scopes',
				},
			],
			default: 'openid offline_access public_api_scope',
			description: 'Select the permission level for this connection',
		},
		{
			displayName: 'Custom Scopes',
			name: 'customScope',
			type: 'string',
			displayOptions: {
				show: {
					scope: ['custom'],
				},
			},
			default: 'openid offline_access generations:write generations:read talents:read shots:read requests:read',
			description: 'Space-separated list of OAuth scopes. Always include "openid offline_access" for token refresh.',
			hint: 'Available scopes: public_api_scope, generations:write, generations:read, talents:read, shots:read, requests:read',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: 'prompt=consent&source=n8n',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{"Bearer " + $credentials.accessToken}}',
			},
		},
	};
	test: ICredentialTestRequest = {
		request: {
			baseURL: process.env.DREEM_API_BASE_URL || 'https://gateway.dreem.ai',
			url: '/studio/resources/talent-options',
			method: 'GET',
		},
	};
}
