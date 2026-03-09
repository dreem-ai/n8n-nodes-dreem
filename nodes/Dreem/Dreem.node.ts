import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// Helper function to get base URL from environment variable
function getBaseUrl(): string {
	return process.env.DREEM_API_BASE_URL || 'https://gateway.dreem.ai';
}

export class Dreem implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Dreem',
		name: 'dreem',
		icon: 'file:dreem.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'AI-powered image generation with Dreem',
		defaults: {
			name: 'Dreem',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'dreemOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authentication: ['oAuth2'],
					},
				},
			},
			{
				name: 'dreemApi',
				required: true,
				displayOptions: {
					show: {
						authentication: ['apiKey'],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{ name: 'OAuth2', value: 'oAuth2' },
					{ name: 'API Key', value: 'apiKey' },
				],
				default: 'oAuth2',
				description: 'Choose how to authenticate with the Dreem API',
			},

			// ========================================================
			// Resource Selection
			// ========================================================
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Generative Content',
						value: 'content',
						description: 'Generate AI-powered content',
					},
					{
						name: 'Library',
						value: 'library',
						description: 'Browse available talents and shots',
					},
					{
						name: 'Task',
						value: 'task',
						description: 'Track generation task status',
					},
				],
				default: 'content',
			},

			// ========================================================
			// Content Operations
			// ========================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['content'],
					},
				},
				options: [
					{
						name: 'Generate Model Shots',
						value: 'generateModelShots',
						description: 'Try your product on different models and shots',
						action: 'Generate model shots',
					},
					{
						name: 'Generate Product Shots',
						value: 'generateProductShots',
						description: 'Generate clean, studio-style product shots',
						action: 'Generate product shots',
					},
				],
				default: 'generateModelShots',
			},

			// --------------------------------------------------------
			// Content > Generate Model Shots — Fields
			// --------------------------------------------------------

			// Talent Selection
			{
				displayName: 'Talent',
				name: 'talentId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTalents',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateModelShots'],
					},
				},
				description: 'The AI model to use for generation',
			},

			// Shots Selection (Model Shots & Product Shots)
			{
				displayName: 'Shots',
				name: 'shotCodes',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getShots',
					loadOptionsDependsOn: ['operation'],
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateModelShots', 'generateProductShots'],
					},
				},
				default: [],
				description: 'Shots to generate',
			},

			// Front Image URL (required)
			{
				displayName: 'Front Image URL',
				name: 'frontImageUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateModelShots', 'generateProductShots'],
					},
				},
				default: '',
				description: 'URL of the front product image',
				placeholder: 'https://example.com/front.jpg',
			},

			// Back Image URL (optional)
			{
				displayName: 'Back Image URL',
				name: 'backImageUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateModelShots', 'generateProductShots'],
					},
				},
				default: '',
				description: 'URL of the back product image (optional)',
				placeholder: 'https://example.com/back.jpg',
			},

			// Styling Image URLs (optional, repeatable)
			{
				displayName: 'Styling Image URLs',
				name: 'stylingImageUrls',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateModelShots'],
					},
				},
				default: {},
				placeholder: 'Add Image',
				description: 'Styling/outfit images to include in generation',
				options: [
					{
						name: 'imageValues',
						displayName: 'Image',
						values: [
							{
								displayName: 'Image URL',
								name: 'url',
								type: 'string',
								default: '',
								description: 'URL of the styling image',
								required: true,
								placeholder: 'https://example.com/outfit.jpg',
							},
						],
					},
				],
			},

			// Output Format (Model Shots & Product Shots)
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateModelShots', 'generateProductShots'],
					},
				},
				options: [
					{ name: 'PNG', value: 'png' },
					{ name: 'JPEG', value: 'jpeg' },
				],
				default: 'png',
				description: 'Output image format',
			},

			// Output Aspect Ratio (Model Shots & Product Shots)
			{
				displayName: 'Output Aspect Ratio',
				name: 'outputAspectRatio',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateModelShots', 'generateProductShots'],
					},
				},
				options: [
					{ name: '1:1 (Square)', value: 0 },
					{ name: '4:3', value: 1 },
					{ name: '3:2', value: 2 },
					{ name: '2:3', value: 3 },
					{ name: '5:4', value: 4 },
					{ name: '4:5', value: 5 },
					{ name: '3:4', value: 6 },
					{ name: '9:16 (Portrait)', value: 7 },
					{ name: '16:9 (Landscape)', value: 8 },
					{ name: '21:9 (Ultrawide)', value: 9 },
				],
				default: 6,
				description: 'Aspect ratio for the generated image',
			},



			// --------------------------------------------------------
			// Content > Generate Product Shots — Fields
			// --------------------------------------------------------



			// Callback URL (shared for Model Shots & Product Shots)
			{
				displayName: 'Webhook URL',
				name: 'callbackUrl',
				type: 'string',
				required: false,
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateModelShots', 'generateProductShots'],
					},
				},
				default: '',
				description: 'URL to receive generation results (webhook callback). Required by the API.',
				placeholder: 'https://webhook.site/your-unique-url',
			},

			// ========================================================
			// Library Operations
			// ========================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['library'],
					},
				},
				options: [
					{
						name: 'Get Available Talents',
						value: 'getAvailableTalents',
						description: 'List all available AI models',
						action: 'Get available talents',
					},
					{
						name: 'Get Available Shots',
						value: 'getAvailableShots',
						description: 'List all available shots',
						action: 'Get available shots',
					},
				],
				default: 'getAvailableTalents',
			},

			// ========================================================
			// Task Operations
			// ========================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['task'],
					},
				},
				options: [
					{
						name: 'Get Status',
						value: 'getStatus',
						description: 'Check generation task status',
						action: 'Get generation task status',
					},
				],
				default: 'getStatus',
			},

			// Get Status - Request ID
			{
				displayName: 'Request ID',
				name: 'requestId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['getStatus'],
					},
				},
				default: '',
				description: 'The request ID returned from a generation task',
				placeholder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
			},
		],
	};

	methods = {
		loadOptions: {
			// Load talents for dropdown
			async getTalents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentialType =
					(this.getNodeParameter('authentication', 0) as string) === 'apiKey'
						? 'dreemApi'
						: 'dreemOAuth2Api';
				const returnData: INodePropertyOptions[] = [];
				try {
					const baseURL = getBaseUrl();

					const apiResponse = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						credentialType,
						{
							method: 'GET',
							baseURL,
							url: '/studio/resources/talent-options',
						},
					)) as any;

					let talents: any[] = [];

					if (Array.isArray(apiResponse)) {
						talents = apiResponse;
					} else if (apiResponse?.data) {
						if (Array.isArray(apiResponse.data)) {
							talents = apiResponse.data;
						} else if (apiResponse.data.pageData && Array.isArray(apiResponse.data.pageData)) {
							talents = apiResponse.data.pageData;
						}
					}

					for (const talent of talents) {
						returnData.push({
							name: talent.label || talent.name || 'Unknown',
							value: talent.value || talent.talentId || talent.id,
						});
					}

					return returnData;
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
			},

			// Load shots for dropdown, filtered by shotType based on operation
			async getShots(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentialType =
					(this.getNodeParameter('authentication', 0) as string) === 'apiKey'
						? 'dreemApi'
						: 'dreemOAuth2Api';
				const returnData: INodePropertyOptions[] = [];
				try {
					const baseURL = getBaseUrl();

					// Filter shots by shotType: generateModelShots = 1, generateProductShots = 0
					const operation = this.getNodeParameter('operation', 0) as string;
					const shotType = operation === 'generateModelShots' ? 1 : 0;

					const apiResponse = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						credentialType,
						{
							method: 'GET',
							baseURL,
							url: '/styleguide/resources/shots',
							qs: { shotType },
						},
					)) as any;

					// Handle different response structures
					let shots: any[] = [];

					if (Array.isArray(apiResponse)) {
						shots = apiResponse;
					} else if (apiResponse?.data) {
						if (Array.isArray(apiResponse.data)) {
							shots = apiResponse.data;
						} else if (apiResponse.data.pageData && Array.isArray(apiResponse.data.pageData)) {
							shots = apiResponse.data.pageData;
						}
					}

					for (const shot of shots) {
						returnData.push({
							name: shot.name || shot.shotName,
							value: shot.code || shot.shotCode,
							description: shot.code || shot.shotCode || '',
						});
					}

					return returnData;
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const authentication = this.getNodeParameter('authentication', 0) as 'oAuth2' | 'apiKey';
		const credentialType = authentication === 'apiKey' ? 'dreemApi' : 'dreemOAuth2Api';

		// Get base URL from environment variable
		const baseURL = getBaseUrl();

		for (let i = 0; i < items.length; i++) {
			try {
				// ==============================================
				// Resource: Content
				// ==============================================
				if (resource === 'content') {
					if (operation === 'generateModelShots') {
						const talentId = this.getNodeParameter('talentId', i) as string;
						const shotCodes = this.getNodeParameter('shotCodes', i) as string[];

						// --- Build imagesList from front/back/styling image fields ---
						const imagesList: Array<{ url: string; productType: number; viewType?: number }> = [];

						// Front Image URL (required)
						const frontImageUrl = (this.getNodeParameter('frontImageUrl', i) as string).trim();
						if (frontImageUrl) {
							imagesList.push({ url: frontImageUrl, productType: 0, viewType: 0 });
						}

						// Back Image URL (optional)
						const backImageUrl = (this.getNodeParameter('backImageUrl', i, '') as string).trim();
						if (backImageUrl) {
							imagesList.push({ url: backImageUrl, productType: 0, viewType: 1 });
						}

						// Styling Image URLs (optional, repeatable)
						const stylingImages = this.getNodeParameter('stylingImageUrls', i, {}) as {
							imageValues?: Array<{ url: string }>;
						};
						if (stylingImages.imageValues) {
							for (const img of stylingImages.imageValues) {
								const url = img.url.trim();
								if (url) {
									imagesList.push({ url, productType: 1 });
								}
							}
						}

						if (imagesList.length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								'At least one product image is required',
								{ itemIndex: i },
							);
						}

						// Build request body
						const callbackUrl = this.getNodeParameter('callbackUrl', i) as string;
						const outputFormat = this.getNodeParameter('outputFormat', i) as string;
						const outputAspectRatio = this.getNodeParameter('outputAspectRatio', i) as number;

						const body: Record<string, unknown> = {
							talentId,
							shotCodes,
							images: imagesList,
							callbackUrl,
							outputFormat,
							outputAspectRatio,
						};

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'POST',
								baseURL,
								url: '/ai-tool/generation/virtual-model',
								body,
							},
						);

						returnData.push({
							json: response as JsonObject,
							pairedItem: { item: i },
						});
					} else if (operation === 'generateProductShots') {
						const shotCodes = this.getNodeParameter('shotCodes', i) as string[];

						// --- Build imagesList from front/back image fields ---
						const imagesList: Array<{ url: string; productType: number; viewType?: number }> = [];

						// Front Image URL (required)
						const frontImageUrl = (this.getNodeParameter('frontImageUrl', i) as string).trim();
						if (frontImageUrl) {
							imagesList.push({ url: frontImageUrl, productType: 0, viewType: 0 });
						}

						// Back Image URL (optional)
						const backImageUrl = (this.getNodeParameter('backImageUrl', i, '') as string).trim();
						if (backImageUrl) {
							imagesList.push({ url: backImageUrl, productType: 0, viewType: 1 });
						}

						if (imagesList.length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								'At least one product image is required',
								{ itemIndex: i },
							);
						}

						const outputFormat = this.getNodeParameter('outputFormat', i) as string;
						const outputAspectRatio = this.getNodeParameter('outputAspectRatio', i) as number;
						const callbackUrl = this.getNodeParameter('callbackUrl', i) as string;

						const body: Record<string, unknown> = {
							shotCodes,
							images: imagesList,
							callbackUrl,
							outputFormat,
							outputAspectRatio,
						};

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'POST',
								baseURL,
								url: '/ai-tool/generation/packshots',
								body,
							},
						);

						returnData.push({
							json: response as JsonObject,
							pairedItem: { item: i },
						});
					}
				}

				// ==============================================
				// Resource: Library
				// ==============================================
				else if (resource === 'library') {
					if (operation === 'getAvailableTalents') {
						const apiResponse = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								baseURL,
								url: '/studio/resources/talent-options',
							},
						)) as any;

						// Handle different response structures
						let talents: any[] = [];

						if (Array.isArray(apiResponse)) {
							talents = apiResponse;
						} else if (apiResponse?.data) {
							if (Array.isArray(apiResponse.data)) {
								talents = apiResponse.data;
							} else if (apiResponse.data.pageData && Array.isArray(apiResponse.data.pageData)) {
								talents = apiResponse.data.pageData;
							} else if (typeof apiResponse.data === 'object') {
								talents = [apiResponse.data];
							}
						}

						for (const talent of talents) {
							returnData.push({
								json: talent,
								pairedItem: { item: i },
							});
						}
					} else if (operation === 'getAvailableShots') {
						const apiResponse = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								baseURL,
								url: '/studio/resources/shots',
							},
						)) as any;

						// Handle different response structures
						let shots: any[] = [];

						if (Array.isArray(apiResponse)) {
							shots = apiResponse;
						} else if (apiResponse?.data) {
							if (Array.isArray(apiResponse.data)) {
								shots = apiResponse.data;
							} else if (apiResponse.data.pageData && Array.isArray(apiResponse.data.pageData)) {
								shots = apiResponse.data.pageData;
							} else if (typeof apiResponse.data === 'object') {
								shots = [apiResponse.data];
							}
						}

						for (const shot of shots) {
							returnData.push({
								json: shot,
								pairedItem: { item: i },
							});
						}
					}
				}

				// ==============================================
				// Resource: Task
				// ==============================================
				else if (resource === 'task') {
					if (operation === 'getStatus') {
						const requestId = this.getNodeParameter('requestId', i) as string;

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								baseURL,
								url: `/studio/requests/${requestId}`,
							},
						);

						returnData.push({
							json: response as JsonObject,
							pairedItem: { item: i },
						});
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
