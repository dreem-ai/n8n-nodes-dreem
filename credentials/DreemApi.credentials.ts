import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class DreemApi implements ICredentialType {
	name = 'dreemApi';
	displayName = 'Dreem API';
	documentationUrl = 'https://docs.dreem.ai/api';

	properties: INodeProperties[] = [
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{
					name: 'Production',
					value: 'production',
				},
				{
					name: 'Development',
					value: 'development',
				},
			],
			default: 'production',
			description: 'Select the Dreem environment to connect to',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: 'dreem_pk_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
			description: 'API key issued by Dreem (starts with dreem_pk_). Generate from your Dreem dashboard under Settings → API Management.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Authorization': '={{$credentials.apiKey}}',
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{$credentials.environment === "development" ? "https://gateway.dev.dreem.ai" : "https://gateway.dreem.ai"}}',
			url: '/studio/resources/talent-options',
			method: 'GET',
		},
	};
}
