import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { API_BASE_URL } from './config';

/**
 * Dreem list endpoints return one of:
 *   - an array of items
 *   - { data: T[] }
 *   - { data: { pageData: T[] } }
 *   - { data: T }            (singular fallback, only honored when allowSingleObject=true)
 */
function extractItems<T extends IDataObject = IDataObject>(
	response: unknown,
	{ allowSingleObject = false } = {},
): T[] {
	if (Array.isArray(response)) return response as T[];
	if (response && typeof response === 'object' && 'data' in response) {
		const data = (response as { data: unknown }).data;
		if (Array.isArray(data)) return data as T[];
		if (data && typeof data === 'object' && 'pageData' in data) {
			const pageData = (data as { pageData: unknown }).pageData;
			if (Array.isArray(pageData)) return pageData as T[];
		}
		if (allowSingleObject && data && typeof data === 'object') {
			return [data as T];
		}
	}
	return [];
}

const pickString = (...candidates: unknown[]): string => {
	for (const c of candidates) {
		if (typeof c === 'string' && c.length > 0) return c;
	}
	return '';
};

/**
 * Reads a single attribute's values out of the generic /attributes response.
 * Envelope: { data: { type, attributes: { <key>: string[] } } }; also tolerates the
 * unwrapped { attributes: {...} } or a bare { <key>: [...] } shape.
 */
function extractAttributeValues(response: unknown, attributeKey: string): string[] {
	const root =
		response && typeof response === 'object' && 'data' in response
			? (response as { data: unknown }).data
			: response;
	if (root && typeof root === 'object') {
		const container = 'attributes' in root ? (root as { attributes: unknown }).attributes : root;
		if (container && typeof container === 'object') {
			const list = (container as Record<string, unknown>)[attributeKey];
			if (Array.isArray(list)) {
				return list.filter((v): v is string => typeof v === 'string' && v.length > 0);
			}
		}
	}
	return [];
}

/**
 * Loads the selectable values for one talent trait attribute from the generic
 * /studio/attributes endpoint and maps them to node options. The endpoint
 * returns all attribute types for the object type; we pick the one we need.
 */
async function loadTalentAttributeOptions(
	ctx: ILoadOptionsFunctions,
	attributeKey: string,
): Promise<INodePropertyOptions[]> {
	const credentialType =
		(ctx.getNodeParameter('authentication', 0) as string) === 'apiKey'
			? 'dreemApi'
			: 'dreemOAuth2Api';
	try {
		const apiResponse = await ctx.helpers.httpRequestWithAuthentication.call(ctx, credentialType, {
			method: 'GET',
			baseURL: API_BASE_URL,
			url: '/studio/attributes',
			qs: { type: 'Talent' },
		});
		return extractAttributeValues(apiResponse, attributeKey).map((value) => ({
			name: value,
			value,
		}));
	} catch (error) {
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
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
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
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
					{ name: 'API Key', value: 'apiKey' },
					{ name: 'OAuth2', value: 'oAuth2' },
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
					{
						name: 'Generate Video',
						value: 'generateVideo',
						description: 'Generate video from product image',
						action: 'Generate video from image',
					},
				],
				default: 'generateModelShots',
			},

			// --------------------------------------------------------
			// Content > Generate Model Shots — Fields
			// --------------------------------------------------------

			// Talent Selection
			{
				displayName: 'Talent Name or ID',
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
				hint: 'The AI model to use for generation',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},

			// Shots Selection (Model Shots & Product Shots)
			{
				displayName: 'Shot Names or IDs',
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
				hint: 'Shots to generate',
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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
					{ name: 'JPEG', value: 'jpeg' },
					{ name: 'PNG', value: 'png' },
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
					{ name: '16:9 (Landscape)', value: 8 },
					{ name: '2:3', value: 3 },
					{ name: '21:9 (Ultrawide)', value: 9 },
					{ name: '3:2', value: 2 },
					{ name: '3:4', value: 6 },
					{ name: '4:3', value: 1 },
					{ name: '4:5', value: 5 },
					{ name: '5:4', value: 4 },
					{ name: '9:16 (Portrait)', value: 7 },
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
			// --------------------------------------------------------
			// Content > Generate Video — Fields
			// --------------------------------------------------------

			// First Frame URL (required)
			{
				displayName: 'First Frame URL',
				name: 'firstFrameUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateVideo'],
					},
				},
				default: '',
				description: 'URL of the first frame image (start frame)',
				placeholder: 'https://example.com/first-frame.jpg',
			},

			// Last Frame URL (optional)
			{
				displayName: 'Last Frame URL',
				name: 'lastFrameUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateVideo'],
					},
				},
				default: '',
				description: 'URL of the last frame image (end frame, optional)',
				placeholder: 'https://example.com/last-frame.jpg',
			},

			// Video Duration
			{
				displayName: 'Duration',
				name: 'duration',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateVideo'],
					},
				},
				options: [
					{ name: '10 Seconds', value: '10s' },
					{ name: '5 Seconds', value: '5s' },
				],
				default: '10s',
				description: 'Duration of the output video',
			},

			// Video Output Aspect Ratio
			{
				displayName: 'Output Aspect Ratio',
				name: 'videoOutputAspectRatio',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateVideo'],
					},
				},
				options: [
					{ name: '1:1 (Square)', value: 0 },
					{ name: '3:4', value: 6 },
					{ name: '9:16 (Portrait)', value: 7 },
				],
				default: 7,
				description: 'Aspect ratio for the generated video. Only 1:1, 3:4, and 9:16 are supported.',
			},
			// Video Prompt ID (dropdown)
			{
				displayName: 'Prompt Name or ID',
				name: 'promptId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getVideoPrompts',
				},
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateVideo'],
					},
				},
				default: '',
				hint: 'Select a video generation prompt from the library (optional)',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},

			// Video Prompt (text input)
			{
				displayName: 'Prompt (Custom Text)',
				name: 'videoPrompt',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateVideo'],
					},
				},
				default: '',
				description: 'Or enter a custom text prompt to guide video generation (optional)',
				placeholder: 'e.g., Model walking gracefully',
			},

			// Video Callback URL
			{
				displayName: 'Webhook URL',
				name: 'videoCallbackUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['content'],
						operation: ['generateVideo'],
					},
				},
				default: '',
				description: 'URL to receive generation results (webhook callback)',
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
						name: 'Get Available Shots',
						value: 'getAvailableShots',
						description: 'List all available shots',
						action: 'Get available shots',
					},
					{
						name: 'Get Available Talents',
						value: 'getAvailableTalents',
						description: 'List all available AI models',
						action: 'Get available talents',
					},
					{
						name: 'Get Video Prompts',
						value: 'getVideoPrompts',
						description: 'List available video generation prompts',
						action: 'Get video prompts',
					},
					{
						name: 'Search Shots',
						value: 'searchShots',
						description: 'Semantically search shots (poses) by a free-text brief',
						action: 'Search shots',
					},
					{
						name: 'Search Talents',
						value: 'searchTalents',
						description: 'Semantically search AI models by a free-text brief',
						action: 'Search talents',
					},
					{
						name: 'Search Video Prompts',
						value: 'searchVideoPrompts',
						description: 'Semantically search video generation prompts by a free-text brief',
						action: 'Search video prompts',
					},
				],
				default: 'getAvailableTalents',
			}, // --------------------------------------------------------
			// Library > Get Available Talents — Fields
			// --------------------------------------------------------			// Gender Filter for Talents
			{
				displayName: 'Gender',
				name: 'talentGender',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableTalents'],
					},
				},
				options: [
					{ name: 'All', value: 0 },
					{ name: 'Female', value: 2 },
					{ name: 'Male', value: 1 },
					{ name: 'Unisex', value: 3 },
				],
				default: 0,
				placeholder: '0 (All), 1 (Male), 2 (Female), 3 (Unisex)',
				hint: 'Use values: 0=All, 1=Male, 2=Female, 3=Unisex',
				description: 'Filter talents by gender. All=0, Male=1, Female=2, Unisex=3.',
			},

			// Search Keyword for Talents
			{
				displayName: 'Search Keyword',
				name: 'talentKeyword',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableTalents'],
					},
				},
				default: '',
				description: 'Search talents by keyword (optional)',
				placeholder: 'e.g., model name',
			},

			// Page Number for Talents
			{
				displayName: 'Page Number',
				name: 'talentPageNumber',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableTalents'],
					},
				},
				default: 1,
				description: 'Page number for pagination',
				typeOptions: {
					minValue: 1,
				},
			},

			// Page Size for Talents
			{
				displayName: 'Page Size',
				name: 'talentPageSize',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableTalents'],
					},
				},
				default: 10,
				description: 'Number of talents per page',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
			},

			// Age Group trait filter for Talents (values loaded from the API)
			{
				displayName: 'Age Group Names or IDs',
				name: 'talentAgeGroup',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getTalentAgeGroups',
				},
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableTalents'],
					},
				},
				default: [],
				hint: 'Filter by age group. Multiple values are OR-ed together.',
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},

			// Body Build trait filter for Talents (values loaded from the API)
			{
				displayName: 'Body Build Names or IDs',
				name: 'talentBodyBuild',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getTalentBodyBuilds',
				},
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableTalents'],
					},
				},
				default: [],
				hint: 'Filter by body build. Multiple values are OR-ed together.',
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},

			// Ethnicity trait filter for Talents (values loaded from the API)
			{
				displayName: 'Ethnicity Names or IDs',
				name: 'talentEthnicity',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getTalentEthnicities',
				},
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableTalents'],
					},
				},
				default: [],
				hint: 'Filter by ethnicity. Multiple values are OR-ed together.',
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},

			// --------------------------------------------------------
			// Library > Search Talents — Fields
			// --------------------------------------------------------
			// Free-text brief for semantic search
			{
				displayName: 'Search Keyword',
				name: 'searchKeyword',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchTalents'],
					},
				},
				default: '',
				placeholder: 'e.g., scandinavian blonde 20s',
				description:
					'Free-text brief describing the talent. Descriptors such as ethnicity and body build are matched semantically. Leave empty to return the most recent talents for the selected gender.',
			},

			// Gender for semantic search (required, Male/Female only)
			{
				displayName: 'Gender',
				name: 'searchGender',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchTalents'],
					},
				},
				options: [
					{ name: 'Female', value: 2 },
					{ name: 'Male', value: 1 },
				],
				default: 2,
				description:
					'Required. The semantic talent index only covers Male and Female talents.',
			},

			// Limit (top-K) for semantic search
			{
				displayName: 'Limit',
				name: 'searchLimit',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchTalents'],
					},
				},
				default: 5,
				description: 'Number of top-ranked matches to return (maps to page size, clamped 1–20)',
				typeOptions: {
					minValue: 1,
					maxValue: 20,
				},
			},

			// --------------------------------------------------------
			// Library > Get Available Shots — Fields
			// --------------------------------------------------------
			// Shot Type Filter
			{
				displayName: 'Shot Type',
				name: 'shotType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableShots'],
					},
				},
				options: [
					{ name: 'All', value: -1 },
					{ name: 'Pack Shot (Product)', value: 0 },
					{ name: 'Video', value: 5 },
					{ name: 'Virtual Model', value: 1 },
				],
				default: -1,
				description: 'Filter shots by type',
			},

			// Search Keyword for Shots
			{
				displayName: 'Search Keyword',
				name: 'shotKeyword',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableShots'],
					},
				},
				default: '',
				description: 'Search shots by keyword (optional)',
				placeholder: 'e.g., front, side',
			},

			// Page Number for Shots
			{
				displayName: 'Page Number',
				name: 'shotPageNumber',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableShots'],
					},
				},
				default: 1,
				description: 'Page number for pagination',
				typeOptions: {
					minValue: 1,
				},
			},

			// Page Size for Shots
			{
				displayName: 'Page Size',
				name: 'shotPageSize',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getAvailableShots'],
					},
				},
				default: 20,
				description: 'Number of shots per page',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
			},

			// --------------------------------------------------------
			// Library > Search Shots — Fields
			// --------------------------------------------------------
			// Free-text brief for semantic search
			{
				displayName: 'Search Keyword',
				name: 'shotSearchKeyword',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchShots'],
					},
				},
				default: '',
				placeholder: 'e.g., confident walking full body',
				description:
					'Free-text brief describing the shot (pose). Leave empty to return the newest shots instead of a semantic ranking.',
			},

			// Shot type scope for semantic search
			{
				displayName: 'Shot Type',
				name: 'shotSearchType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchShots'],
					},
				},
				options: [
					{ name: 'All', value: -1 },
					{ name: 'Pack Shot (Product)', value: 0 },
					{ name: 'Virtual Model', value: 1 },
				],
				default: -1,
				description:
					'Limit the search to one shot type. Video shots are not in the semantic index, so they are never returned.',
			},

			// Gender for semantic search (applies to Virtual Model shots only)
			{
				displayName: 'Gender',
				name: 'shotSearchGender',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchShots'],
						shotSearchType: [-1, 1],
					},
				},
				options: [
					{ name: 'Any', value: 0 },
					{ name: 'Female', value: 2 },
					{ name: 'Male', value: 1 },
					{ name: 'Unisex', value: 3 },
				],
				default: 0,
				description: 'Filter by gender. Applied to Virtual Model shots only, ignored otherwise.',
			},

			// Limit (top-K) for semantic search
			{
				displayName: 'Limit',
				name: 'shotSearchLimit',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchShots'],
					},
				},
				default: 5,
				description: 'Number of top-ranked matches to return (maps to page size, clamped 1–20)',
				typeOptions: {
					minValue: 1,
					maxValue: 20,
				},
			},

			// --------------------------------------------------------
			// Library > Get Video Prompts — Fields
			// --------------------------------------------------------			// Gender Filter
			{
				displayName: 'Gender',
				name: 'gender',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getVideoPrompts'],
					},
				},
				options: [
					{ name: 'All', value: 0, description: 'Value: 0' },
					{ name: 'Female', value: 2, description: 'Value: 2' },
					{ name: 'Male', value: 1, description: 'Value: 1' },
					{ name: 'Unisex', value: 3, description: 'Value: 3' },
				],
				default: 0,
				placeholder: '0 (All), 1 (Male), 2 (Female), 3 (Unisex)',
				hint: 'Use values: 0=All, 1=Male, 2=Female, 3=Unisex',
				description: 'Filter prompts by gender',
			},

			// Search Keyword
			{
				displayName: 'Search Keyword',
				name: 'keyword',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getVideoPrompts'],
					},
				},
				default: '',
				description: 'Search prompts by keyword (optional)',
				placeholder: 'e.g., walking, dancing',
			},

			// Page Number
			{
				displayName: 'Page Number',
				name: 'pageNum',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getVideoPrompts'],
					},
				},
				default: 1,
				description: 'Page number for pagination',
				typeOptions: {
					minValue: 1,
				},
			},

			// Page Size
			{
				displayName: 'Page Size',
				name: 'pageSize',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['getVideoPrompts'],
					},
				},
				default: 20,
				description: 'Number of prompts per page',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
			},

			// --------------------------------------------------------
			// Library > Search Video Prompts — Fields
			// --------------------------------------------------------
			// Gender for semantic search (required hard filter)
			{
				displayName: 'Gender',
				name: 'promptSearchGender',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchVideoPrompts'],
					},
				},
				options: [
					{ name: 'Female', value: 2 },
					{ name: 'Male', value: 1 },
					{ name: 'Unisex', value: 3 },
				],
				default: 3,
				description:
					'Required hard filter, not a preference. Male returns male prompts only and does not include unisex ones — choose Unisex to search unisex prompts.',
			},

			// Free-text brief for semantic search
			{
				displayName: 'Search Keyword',
				name: 'promptSearchKeyword',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchVideoPrompts'],
					},
				},
				default: '',
				placeholder: 'e.g., slow orbit around the product',
				description:
					'Free-text brief describing the motion. Leave empty to return the newest prompts instead of a semantic ranking.',
			},

			// Limit (top-K) for semantic search
			{
				displayName: 'Limit',
				name: 'promptSearchLimit',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['library'],
						operation: ['searchVideoPrompts'],
					},
				},
				default: 5,
				description: 'Number of top-ranked matches to return (maps to page size, clamped 1–20)',
				typeOptions: {
					minValue: 1,
					maxValue: 20,
				},
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
		usableAsTool: true,
	};

	methods = {
		loadOptions: {
			// Load talents for dropdown with pagination to get all talents
			async getTalents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentialType =
					(this.getNodeParameter('authentication', 0) as string) === 'apiKey'
						? 'dreemApi'
						: 'dreemOAuth2Api';
				const returnData: INodePropertyOptions[] = [];
				try {
					const baseURL = API_BASE_URL;
					let pageNumber = 1;
					const pageSize = 100; // Maximum page size
					let hasMoreData = true;
					const allTalents: IDataObject[] = [];

					// Loop through all pages to get all talents
					while (hasMoreData) {
						const apiResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								baseURL,
								url: '/studio/talents',
								qs: {
									pageNumber,
									pageSize,
								},
							},
						);

						const talents = extractItems(apiResponse);
						allTalents.push(...talents);

						if (talents.length < pageSize) {
							hasMoreData = false;
						} else {
							pageNumber++;
						}
					}

					for (const talent of allTalents) {
						const name = pickString(talent.label, talent.name) || 'Unknown';
						const value = pickString(talent.value, talent.talentId, talent.id);
						if (value) {
							returnData.push({ name, value });
						}
					}

					return returnData;
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
			},

			// Load talent trait filter values from the generic /attributes endpoint
			async getTalentAgeGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return loadTalentAttributeOptions(this, 'ageGroup');
			},

			async getTalentEthnicities(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return loadTalentAttributeOptions(this, 'ethnicity');
			},

			async getTalentBodyBuilds(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return loadTalentAttributeOptions(this, 'bodyBuild');
			},

			// Load shots for dropdown, filtered by shotType based on operation
			async getShots(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentialType =
					(this.getNodeParameter('authentication', 0) as string) === 'apiKey'
						? 'dreemApi'
						: 'dreemOAuth2Api';
				const returnData: INodePropertyOptions[] = [];
				try {
					const baseURL = API_BASE_URL;

					// Filter shots by shotType: generateModelShots = 1, generateProductShots = 0
					const operation = this.getNodeParameter('operation', 0) as string;
					const shotType = operation === 'generateModelShots' ? 1 : 0;

					const apiResponse = await this.helpers.httpRequestWithAuthentication.call(
						this,
						credentialType,
						{
							method: 'GET',
							baseURL,
							url: '/studio/shots',
							qs: { shotType },
						},
					);

					const shots = extractItems(apiResponse);
					for (const shot of shots) {
						const name = pickString(shot.name, shot.shotName) || 'Unknown';
						const value = pickString(shot.code, shot.shotCode);
						if (value) {
							returnData.push({ name, value, description: value });
						}
					}

					return returnData;
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
			},

			// Load video prompts for dropdown
			async getVideoPrompts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentialType =
					(this.getNodeParameter('authentication', 0) as string) === 'apiKey'
						? 'dreemApi'
						: 'dreemOAuth2Api';
				const returnData: INodePropertyOptions[] = [];
				try {
					const baseURL = API_BASE_URL;
					const requestBody: IDataObject = {
						keyword: '',
						pageNum: 1,
						pageSize: 100,
					};
					// Don't include gender parameter to get all genders

					// Get video prompts from API
					const apiResponse = await this.helpers.httpRequestWithAuthentication.call(
						this,
						credentialType,
						{
							method: 'POST',
							baseURL,
							url: '/studio/video-prompts/list',
							body: requestBody,
						},
					);

					const prompts = extractItems(apiResponse);
					// Filter only SYSTEM sourceType prompts
					const systemPrompts = prompts.filter((prompt) => prompt.sourceType === 'SYSTEM');
					for (const prompt of systemPrompts) {
						const name = pickString(prompt.name, prompt.title, prompt.prompt) || 'Unknown';
						const value = pickString(prompt.id, prompt.promptId);
						if (value) {
							returnData.push({
								name,
								value,
								description: pickString(prompt.description),
							});
						}
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
		const baseURL = API_BASE_URL;

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
								url: '/ai-tool/virtual-model',
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
								url: '/ai-tool/packshot',
								body,
							},
						);

						returnData.push({
							json: response as JsonObject,
							pairedItem: { item: i },
						});
					} else if (operation === 'generateVideo') {
						const firstFrameUrl = (this.getNodeParameter('firstFrameUrl', i) as string).trim();

						if (!firstFrameUrl) {
							throw new NodeOperationError(this.getNode(), 'First Frame URL is required', {
								itemIndex: i,
							});
						}

						const lastFrameUrl = (this.getNodeParameter('lastFrameUrl', i, '') as string).trim();
						const duration = this.getNodeParameter('duration', i) as string;
						const outputAspectRatio = this.getNodeParameter('videoOutputAspectRatio', i) as number;
						const promptId = this.getNodeParameter('promptId', i, '') as string;
						const videoPrompt = this.getNodeParameter('videoPrompt', i, '') as string;
						const callbackUrl = this.getNodeParameter('videoCallbackUrl', i, '') as string;

						// Build images array with first frame (required) and last frame (optional)
						const images: Array<{ url: string; frameType: number }> = [
							{
								url: firstFrameUrl,
								frameType: 0, // Start frame
							},
						];

						// Add last frame if provided
						if (lastFrameUrl) {
							images.push({
								url: lastFrameUrl,
								frameType: 1, // End frame
							});
						}

						const body: Record<string, unknown> = {
							images,
							duration,
							outputAspectRatio,
						};

						// Add optional fields - prioritize promptId over videoPrompt
						if (promptId) {
							body.promptId = promptId;
						} else if (videoPrompt) {
							body.prompt = videoPrompt;
						}
						if (callbackUrl) {
							body.callbackUrl = callbackUrl;
						}

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'POST',
								baseURL,
								url: '/ai-tool/image-to-video',
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
						const talentGender = this.getNodeParameter('talentGender', i) as number;
						const talentKeyword = this.getNodeParameter('talentKeyword', i, '') as string;
						const talentPageNumber = this.getNodeParameter('talentPageNumber', i) as number;
						const talentPageSize = this.getNodeParameter('talentPageSize', i) as number;
						const talentAgeGroup = this.getNodeParameter('talentAgeGroup', i, []) as string[];
						const talentBodyBuild = this.getNodeParameter('talentBodyBuild', i, []) as string[];
						const talentEthnicity = this.getNodeParameter('talentEthnicity', i, []) as string[];

						// Build query parameters
						const queryParams: IDataObject = {
							pageNumber: talentPageNumber,
							pageSize: talentPageSize,
						};

						// Only include gender if not "All" (0)
						if (talentGender !== 0) {
							queryParams.gender = talentGender;
						}
						// Only include keyword if provided
						if (talentKeyword) {
							queryParams.keyword = talentKeyword;
						}
						// Structured trait filters (repeatable). Sent as arrays so the backend
						// receives repeated query keys (e.g. ageGroup=Teen&ageGroup=Senior).
						if (talentAgeGroup.length) {
							queryParams.ageGroup = talentAgeGroup;
						}
						if (talentBodyBuild.length) {
							queryParams.bodyBuild = talentBodyBuild;
						}
						if (talentEthnicity.length) {
							queryParams.ethnicity = talentEthnicity;
						}

						const apiResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								baseURL,
								url: '/studio/talents',
								qs: queryParams,
							},
						);

						const talents = extractItems(apiResponse, { allowSingleObject: true });
						for (const talent of talents) {
							returnData.push({
								json: talent,
								pairedItem: { item: i },
							});
						}
					} else if (operation === 'getAvailableShots') {
						const shotType = this.getNodeParameter('shotType', i) as number;
						const shotKeyword = this.getNodeParameter('shotKeyword', i, '') as string;
						const shotPageNumber = this.getNodeParameter('shotPageNumber', i) as number;
						const shotPageSize = this.getNodeParameter('shotPageSize', i) as number;

						// Build query parameters
						const queryParams: IDataObject = {
							pageNumber: shotPageNumber,
							pageSize: shotPageSize,
						};

						// Only include shotType if not "All" (-1)
						if (shotType !== -1) {
							queryParams.shotType = shotType;
						}
						// Only include keyword if provided
						if (shotKeyword) {
							queryParams.keyword = shotKeyword;
						}

						const apiResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								baseURL,
								url: '/studio/shots',
								qs: queryParams,
							},
						);

						const shots = extractItems(apiResponse, { allowSingleObject: true });
						for (const shot of shots) {
							returnData.push({
								json: shot,
								pairedItem: { item: i },
							});
						}
					} else if (operation === 'searchShots') {
						const shotSearchKeyword = this.getNodeParameter('shotSearchKeyword', i, '') as string;
						const shotSearchType = this.getNodeParameter('shotSearchType', i) as number;
						const shotSearchGender = this.getNodeParameter('shotSearchGender', i, 0) as number;
						const shotSearchLimit = this.getNodeParameter('shotSearchLimit', i) as number;

						// pageNumber is only present for the response envelope shape; the endpoint
						// always returns the first top-K page of semantically ranked matches.
						const queryParams: IDataObject = {
							pageNumber: 1,
							pageSize: shotSearchLimit,
						};
						// Only include keyword if provided (empty = newest shots, no ranking)
						if (shotSearchKeyword) {
							queryParams.keyword = shotSearchKeyword;
						}
						// Only include shotType if not "All" (-1)
						if (shotSearchType !== -1) {
							queryParams.shotType = shotSearchType;
						}
						// Gender applies to Model shots only; the API ignores it otherwise
						if (shotSearchGender !== 0) {
							queryParams.gender = shotSearchGender;
						}

						const apiResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								baseURL,
								url: '/studio/shots/search',
								qs: queryParams,
							},
						);

						const shots = extractItems(apiResponse, { allowSingleObject: true });
						for (const shot of shots) {
							returnData.push({
								json: shot,
								pairedItem: { item: i },
							});
						}
					} else if (operation === 'getVideoPrompts') {
						const gender = this.getNodeParameter('gender', i) as number;
						const keyword = this.getNodeParameter('keyword', i, '') as string;
						const pageNum = this.getNodeParameter('pageNum', i) as number;
						const pageSize = this.getNodeParameter('pageSize', i) as number;

						const requestBody: IDataObject = {
							keyword,
							pageNum,
							pageSize,
						};
						// Only include gender if not "All" (0)
						if (gender !== 0) {
							requestBody.gender = gender;
						}

						const apiResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'POST',
								baseURL,
								url: '/studio/video-prompts/list',
								body: requestBody,
							},
						);

						const prompts = extractItems(apiResponse, { allowSingleObject: true });
						// Filter only SYSTEM sourceType prompts
						const systemPrompts = prompts.filter((prompt) => prompt.sourceType === 'SYSTEM');
						for (const prompt of systemPrompts) {
							returnData.push({ json: prompt, pairedItem: { item: i } });
						}
					} else if (operation === 'searchTalents') {
						const searchKeyword = this.getNodeParameter('searchKeyword', i, '') as string;
						const searchGender = this.getNodeParameter('searchGender', i) as number;
						const searchLimit = this.getNodeParameter('searchLimit', i) as number;

						// pageNumber is only present for the response envelope shape; the endpoint
						// returns the top-K ranked matches rather than a real page.
						const queryParams: IDataObject = {
							gender: searchGender,
							pageNumber: 1,
							pageSize: searchLimit,
						};
						// Only include keyword if provided (empty = most recent for the gender)
						if (searchKeyword) {
							queryParams.keyword = searchKeyword;
						}

						const apiResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								baseURL,
								url: '/studio/talents/search',
								qs: queryParams,
							},
						);

						const talents = extractItems(apiResponse, { allowSingleObject: true });
						for (const talent of talents) {
							returnData.push({
								json: talent,
								pairedItem: { item: i },
							});
						}
					} else if (operation === 'searchVideoPrompts') {
						const promptSearchGender = this.getNodeParameter('promptSearchGender', i) as number;
						const promptSearchKeyword = this.getNodeParameter(
							'promptSearchKeyword',
							i,
							'',
						) as string;
						const promptSearchLimit = this.getNodeParameter('promptSearchLimit', i) as number;

						// Unlike POST /video-prompts/list, the search endpoint is a GET and pages
						// with `pageNumber` (not `pageNum`). pageNumber is only present for the
						// response envelope shape; the endpoint always returns the first top-K page.
						const queryParams: IDataObject = {
							gender: promptSearchGender,
							pageNumber: 1,
							pageSize: promptSearchLimit,
						};
						// Only include keyword if provided (empty = newest prompts, no ranking)
						if (promptSearchKeyword) {
							queryParams.keyword = promptSearchKeyword;
						}

						const apiResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								baseURL,
								url: '/studio/video-prompts/search',
								qs: queryParams,
							},
						);

						// No sourceType filter here, unlike getVideoPrompts: the ranked top-K covers
						// both SYSTEM and tenant-owned CUSTOM prompts, and dropping CUSTOM ones would
						// silently return fewer than the requested limit.
						const prompts = extractItems(apiResponse, { allowSingleObject: true });
						for (const prompt of prompts) {
							returnData.push({
								json: prompt,
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
				if (error instanceof NodeApiError || error instanceof NodeOperationError) {
					throw error;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
