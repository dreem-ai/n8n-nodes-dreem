import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';
import { API_BASE_URL } from '../nodes/Dreem/config';

export class DreemApi implements ICredentialType {
	name = 'dreemApi';
	displayName = 'Dreem API';
	icon = 'file:dreem.svg' as const;
	documentationUrl = 'https://docs.dreem.ai/integrations/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: 'dreem_pk_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
			description:
				'API key issued by Dreem (starts with dreem_pk_). Generate from your Dreem dashboard under Settings → API Management.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{$credentials.apiKey}}',
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: API_BASE_URL || 'https://gateway.dreem.ai',
			url: '/studio/resources/talent-options',
			method: 'GET',
		},
	};
}
