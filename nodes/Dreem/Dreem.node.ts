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

// Helper function to get base URL from credentials
async function getBaseUrl(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	credentialType: string,
): Promise<string> {
	try {
		const credentials = await context.getCredentials(credentialType);
		const environment = (credentials.environment as string) || 'production';
		return environment === 'development'
			? 'https://gateway.dev.dreem.ai'
			: 'https://gateway.dreem.ai';
	} catch {
		// Default to production if credentials not available
		return 'https://gateway.dreem.ai';
	}
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
		requestDefaults: {
			baseURL: 'https://gateway.dreem.ai/styleguide',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
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
						name: 'Virtual Talent',
						value: 'virtualTalent',
						description: 'Generate images with AI models',
					},
					{
						name: 'Product Shot',
						value: 'packshot',
						description: 'Generate product packshots',
					},
					{
						name: 'Talent',
						value: 'talent',
						description: 'Manage AI models',
					},
					{
						name: 'Shot',
						value: 'shotType',
						description: 'Manage shot types',
					},
					{
						name: 'Request',
						value: 'request',
						description: 'Check generation request status',
					},
				],
				default: 'virtualTalent',
			},

			// ========================================================
			// Virtual Talent Operations
			// ========================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
					},
				},
				options: [
					{
						name: 'Generate',
						value: 'generate',
						description: 'Generate virtual talent images',
						action: 'Generate virtual talent images',
					},
				],
				default: 'generate',
			},

			// Generate Virtual Talent - Talent Selection
			{
				displayName: 'Talent',
				name: 'talentId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
					},
				},
				description: 'The AI model to use for generation',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'searchTalents',
							searchable: true,
						},
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						validation: [
							{
								type: 'regex',
								properties: {
									regex:
										'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
									errorMessage: 'Not a valid Talent ID (UUID)',
								},
							},
						],
						placeholder: 'e.g. B09111F6-57E3-4D6F-A917-B8281CF534EC',
					},
				],
			},

			// Shot Types Selection
			{
				displayName: 'Shot',
				name: 'shotCodes',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getShotTypes',
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
					},
				},
				default: [],
				description: 'Shot types to generate (e.g., portrait, full-body)',
			},

			// Image Input Mode Selector
			{
				displayName: 'Image Input Mode',
				name: 'imageInputMode',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
					},
				},
				options: [
					{
						name: 'Manual',
						value: 'manual',
						description: 'Enter each image URL, product type, and view type manually',
					},
					{
						name: 'JSON',
						value: 'json',
						description: 'Provide a JSON array of image objects (e.g. from a previous node)',
					},
					{
						name: 'URL List',
						value: 'urlList',
						description: 'Provide a list of URLs with shared default product/view type',
					},
				],
				default: 'manual',
				description: 'How to provide product images for generation',
			},

			// Product Images - Manual Mode (fixedCollection)
			{
				displayName: 'Product Images',
				name: 'images',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
						imageInputMode: ['manual'],
					},
				},
				default: {},
				placeholder: 'Add Image',
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
								description: 'URL of the product image',
								required: true,
								placeholder: 'https://example.com/product.jpg',
							},
							{
								displayName: 'Product Type',
								name: 'productType',
								type: 'options',
								options: [
									{ name: 'Main', value: 0 },
									{ name: 'Outfit', value: 1 },
								],
								default: 0,
								description:
									'Type of product in the image (Main = primary product, Outfit = clothing/accessory)',
							},
							{
								displayName: 'View Type',
								name: 'viewType',
								type: 'options',
								options: [
									{ name: 'Front', value: 0 },
									{ name: 'Back', value: 1 },
								],
								default: 0,
								description: 'View angle of the product image',
							},
						],
					},
				],
				description: 'Product images to use in generation',
			},

			// Product Images - JSON Mode
			{
				displayName: 'Images JSON',
				name: 'imagesJson',
				type: 'json',
				required: true,
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
						imageInputMode: ['json'],
					},
				},
				default: '[\n  {\n    "url": "https://example.com/product.jpg",\n    "productType": 0,\n    "viewType": 0\n  }\n]',
				description: 'JSON array of image objects. Each object must have "url" (string), "productType" (0=Main, 1=Outfit), and "viewType" (0=Front, 1=Back). Use an expression like {{ $json.images }} to pass data from a previous node.',
				placeholder: '{{ $json.images }}',
			},

			// Product Images - URL List Mode
			{
				displayName: 'Image URLs',
				name: 'imageUrls',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
						imageInputMode: ['urlList'],
					},
				},
				default: '',
				description: 'Comma-separated list of image URLs, or an expression returning a string array (e.g. {{ $json.urls }}). All images will use the default product type and view type below.',
				placeholder: 'https://example.com/front.jpg, https://example.com/back.jpg',
			},
			{
				displayName: 'Default Product Type',
				name: 'defaultProductType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
						imageInputMode: ['urlList'],
					},
				},
				options: [
					{ name: 'Main', value: 0 },
					{ name: 'Outfit', value: 1 },
				],
				default: 0,
				description: 'Product type applied to all URLs in the list',
			},
			{
				displayName: 'Default View Type',
				name: 'defaultViewType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
						imageInputMode: ['urlList'],
					},
				},
				options: [
					{ name: 'Front', value: 0 },
					{ name: 'Back', value: 1 },
				],
				default: 0,
				description: 'View type applied to all URLs in the list',
			},

			// Output Format (Required)
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
					},
				},
				options: [
					{ name: 'PNG', value: 'png' },
					{ name: 'JPEG', value: 'jpeg' },
				],
				default: 0,
				description: 'Output image format',
			},

			// Output Aspect Ratio (Required)
			{
				displayName: 'Output Aspect Ratio',
				name: 'outputAspectRatio',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
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
				default: 0,
				description: 'Aspect ratio for the generated image',
			},

			// Callback URL (Required)
			{
				displayName: 'Webhook URL',
				name: 'callbackUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
					},
				},
				default: '',
				description: 'URL to receive generation results (webhook callback). Required by the API.',
				placeholder: 'https://webhook.site/your-unique-url',
			},

			// Additional Options
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['virtualTalent'],
						operation: ['generate'],
					},
				},
				options: [
					{
						displayName: 'Webhook Secret',
						name: 'callbackSecret',
						type: 'string',
						typeOptions: {
							password: true,
						},
						default: '',
						description: 'Secret for HMAC signature verification',
					},
					{
						displayName: 'Custom State',
						name: 'state',
						type: 'json',
						default: '{}',
						description: 'Custom metadata object (passed through to webhook)',
						placeholder: '{"orderId": "12345", "source": "n8n"}',
					},
				],
			},

			// ========================================================
			// Request Operations
			// ========================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['request'],
					},
				},
				options: [
					{
						name: 'Get Status',
						value: 'getStatus',
						description: 'Check generation request status',
						action: 'Get generation request status',
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
						resource: ['request'],
						operation: ['getStatus'],
					},
				},
				default: '',
				description: 'The request ID returned from generation request',
				placeholder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
			},

			// ========================================================
			// Packshot Operations
			// ========================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['packshot'],
					},
				},
				options: [
					{
						name: 'Generate',
						value: 'generate',
						description: 'Generate product packshots',
						action: 'Generate product packshots',
					},
				],
				default: 'generate',
			},

			// Packshot - Shot Types
			{
				displayName: 'Shot',
				name: 'shotCodes',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getShotTypes',
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['packshot'],
						operation: ['generate'],
					},
				},
				default: [],
				description: 'Shot types to generate for packshot',
			},
			// Packshot - Product Image
			{
				displayName: 'Product Image URL',
				name: 'imageUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['packshot'],
						operation: ['generate'],
					},
				},
				default: '',
				description: 'URL of the product image',
				placeholder: 'https://example.com/product.jpg',
			},

			// Packshot - Output Format (Required)
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['packshot'],
						operation: ['generate'],
					},
				},
				options: [
					{ name: 'PNG', value: 0 },
					{ name: 'JPEG', value: 1 },
				],
				default: 0,
				description: 'Output image format',
			},

			// Packshot - Output Aspect Ratio (Required)
			{
				displayName: 'Output Aspect Ratio',
				name: 'outputAspectRatio',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['packshot'],
						operation: ['generate'],
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
				default: 0,
				description: 'Aspect ratio for the generated image',
			},

			// Packshot - Additional Options
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['packshot'],
						operation: ['generate'],
					},
				},
				options: [
					{
						displayName: 'Webhook URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						description: 'URL to receive generation results',
					},
					{
						displayName: 'Webhook Secret',
						name: 'callbackSecret',
						type: 'string',
						typeOptions: {
							password: true,
						},
						default: '',
						description: 'Secret for HMAC signature verification',
					},
					{
						displayName: 'Custom State',
						name: 'state',
						type: 'json',
						default: '{}',
						description: 'Custom metadata object (passed through to webhook)',
					},
				],
			},

			// ========================================================
			// Talent Operations (List)
			// ========================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['talent'],
					},
				},
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List all available AI models',
						action: 'Get many AI models',
					},
				],
				default: 'getAll',
			},

			// ========================================================
			// Shot Type Operations (List)
			// ========================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['shotType'],
					},
				},
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List all available shot types',
						action: 'Get many shot types',
					},
				],
				default: 'getAll',
			},
		],
	};
	methods = {
		loadOptions: {
			// Load shot types for dropdown
			async getShotTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentialType =
					(this.getNodeParameter('authentication', 0) as string) === 'apiKey'
						? 'dreemApi'
						: 'dreemOAuth2Api';
				const returnData: INodePropertyOptions[] = [];
				try {
					const baseURL = await getBaseUrl(this, credentialType);

					const apiResponse = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						credentialType,
						{
							method: 'GET',
							baseURL,
							url: '/styleguide/resources/shots',
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
		listSearch: {
			// Search talents for resource locator
			async searchTalents(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<{ results: INodePropertyOptions[] }> {
				const credentialType =
					(this.getNodeParameter('authentication', 0) as string) === 'apiKey'
						? 'dreemApi'
						: 'dreemOAuth2Api';
				const returnData: INodePropertyOptions[] = [];
				try {
					const baseURL = await getBaseUrl(this, credentialType);

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
						}
					}

					// Filter results if search term provided
					if (filter) {
						const filterLower = filter.toLowerCase();
						talents = talents.filter((t) => {
							const label = t.label || t.name || '';
							return label.toLowerCase().includes(filterLower);
						});
					}

					for (const talent of talents) {
						returnData.push({
							name: talent.label || talent.name || 'Unknown',
							value: talent.value || talent.talentId || talent.id,
						});
					}

					return { results: returnData };
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

		// Get base URL from credentials
		const baseURL = await getBaseUrl(this, credentialType);

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'virtualTalent') {
					if (operation === 'generate') {
						const talentId = this.getNodeParameter('talentId', i, '', {
							extractValue: true,
						}) as string;
						const shotCodes = this.getNodeParameter('shotCodes', i) as string[];

						// --- Build imagesList based on imageInputMode ---
						const imageInputMode = this.getNodeParameter('imageInputMode', i, 'manual') as string;
						let imagesList: Array<{ url: string; productType: number; viewType: number }> = [];

						if (imageInputMode === 'manual') {
							// Manual mode: read from fixedCollection
							const images = this.getNodeParameter('images', i) as {
								imageValues?: Array<{ url: string; productType: number; viewType: number }>;
							};
							imagesList = images.imageValues || [];
						} else if (imageInputMode === 'json') {
							// JSON mode: parse JSON array from expression or literal
							const imagesJsonRaw = this.getNodeParameter('imagesJson', i) as string | object;
							let parsed: unknown;
							if (typeof imagesJsonRaw === 'string') {
								try {
									parsed = JSON.parse(imagesJsonRaw);
								} catch (e) {
									throw new NodeOperationError(
										this.getNode(),
										`Invalid JSON in "Images JSON" field: ${(e as Error).message}`,
										{ itemIndex: i },
									);
								}
							} else {
								// Already parsed (expression returned an object/array)
								parsed = imagesJsonRaw;
							}

							if (!Array.isArray(parsed)) {
								throw new NodeOperationError(
									this.getNode(),
									'Images JSON must be an array of image objects, e.g. [{"url":"...","productType":0,"viewType":0}]',
									{ itemIndex: i },
								);
							}

							imagesList = (parsed as Array<Record<string, unknown>>).map((img, idx) => {
								if (!img.url || typeof img.url !== 'string') {
									throw new NodeOperationError(
										this.getNode(),
										`Image at index ${idx} is missing a valid "url" property`,
										{ itemIndex: i },
									);
								}
								return {
									url: img.url as string,
									productType: typeof img.productType === 'number' ? img.productType : 0,
									viewType: typeof img.viewType === 'number' ? img.viewType : 0,
								};
							});
						} else if (imageInputMode === 'urlList') {
							// URL List mode: comma-separated string or array of URLs
							const imageUrlsRaw = this.getNodeParameter('imageUrls', i) as string | string[];
							const defaultProductType = this.getNodeParameter('defaultProductType', i, 0) as number;
							const defaultViewType = this.getNodeParameter('defaultViewType', i, 0) as number;

							let urls: string[];
							if (Array.isArray(imageUrlsRaw)) {
								urls = imageUrlsRaw.map((u) => u.trim()).filter((u) => u.length > 0);
							} else {
								urls = imageUrlsRaw
									.split(',')
									.map((u) => u.trim())
									.filter((u) => u.length > 0);
							}

							imagesList = urls.map((url) => ({
								url,
								productType: defaultProductType,
								viewType: defaultViewType,
							}));
						}

						const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as {
							callbackSecret?: string;
							state?: string;
						};

						if (imagesList.length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								'At least one product image is required',
								{ itemIndex: i },
							);
						}

						// Build request body
						const callbackUrl = this.getNodeParameter('callbackUrl', i) as string;
						const outputFormat = this.getNodeParameter('outputFormat', i) as number;
						const outputAspectRatio = this.getNodeParameter('outputAspectRatio', i) as number;

						const body: Record<string, unknown> = {
							talentId,
							shotCodes,
							images: imagesList,
							callbackUrl,
							outputFormat,
							outputAspectRatio,
						};

						if (additionalOptions.callbackSecret) {
							body.callbackSecret = additionalOptions.callbackSecret;
						}
						if (additionalOptions.state && additionalOptions.state !== '{}') {
							body.state = JSON.parse(additionalOptions.state as string);
						}

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
					}
				} else if (resource === 'request') {
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
				} else if (resource === 'packshot') {
					if (operation === 'generate') {
						const shotCodes = this.getNodeParameter('shotCodes', i) as string[];
						const imageUrl = this.getNodeParameter('imageUrl', i) as string;
						const outputFormat = this.getNodeParameter('outputFormat', i) as number;
						const outputAspectRatio = this.getNodeParameter('outputAspectRatio', i) as number;
						const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as {
							callbackUrl?: string;
							callbackSecret?: string;
							state?: string;
						};

						const body: Record<string, unknown> = {
							shotCodes,
							imageUrl,
							outputFormat,
							outputAspectRatio,
						};

						if (additionalOptions.callbackUrl) {
							body.callbackUrl = additionalOptions.callbackUrl;
						}
						if (additionalOptions.callbackSecret) {
							body.callbackSecret = additionalOptions.callbackSecret;
						}
						if (additionalOptions.state && additionalOptions.state !== '{}') {
							body.state = JSON.parse(additionalOptions.state as string);
						}

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
				} else if (resource === 'talent') {
					if (operation === 'getAll') {
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
					}
				} else if (resource === 'shotType') {
					if (operation === 'getAll') {
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
						let shotTypes: any[] = [];

						if (Array.isArray(apiResponse)) {
							shotTypes = apiResponse;
						} else if (apiResponse?.data) {
							if (Array.isArray(apiResponse.data)) {
								shotTypes = apiResponse.data;
							} else if (apiResponse.data.pageData && Array.isArray(apiResponse.data.pageData)) {
								shotTypes = apiResponse.data.pageData;
							} else if (typeof apiResponse.data === 'object') {
								shotTypes = [apiResponse.data];
							}
						}

						for (const shotType of shotTypes) {
							returnData.push({
								json: shotType,
								pairedItem: { item: i },
							});
						}
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
