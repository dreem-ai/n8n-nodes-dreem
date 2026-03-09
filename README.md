# @dreem/n8n-nodes-dreem

This is an n8n community node. It lets you use Dreem in your n8n workflows.

[Dreem](https://dreem.ai) is an AI-powered image generation platform for e-commerce, enabling you to create professional model shots and product shots from simple product images.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

### Generative Content

- **Generate Model Shots** — Try your product on different AI models and shots. Requires a talent (AI model), shot selection, and at least one product image. Supports optional back and styling images.
- **Generate Product Shots** — Generate clean, studio-style product shots. Requires shot selection and at least one product image.

Both generation operations support configurable output format (PNG/JPEG), aspect ratio, and an optional webhook callback URL.

### Library

- **Get Available Talents** — List all available AI models.
- **Get Available Shots** — List all available shots.

### Task

- **Get Status** — Check the status of a generation task by its request ID.

## Credentials

This node supports two authentication methods:

- **OAuth2** — Connect via OAuth2 (PKCE). Pre-configured for standard n8n usage with selectable permission scopes (Full Access, Generation Only, Read Only, or Custom).
- **API Key** — Authenticate with an API key issued by Dreem. Generate one from your Dreem dashboard under **Settings → API Management**. The key starts with `dreem_pk_`.

## Compatibility

Tested with n8n v1.x. Requires n8n Nodes API version 1.

## Usage

1. Add the **Dreem** node to your workflow.
2. Select an authentication method and configure your credentials.
3. Choose a resource (**Generative Content**, **Library**, or **Task**) and an operation.
4. For generation operations, provide product image URLs and select your desired shots.
5. Generation is asynchronous — use the **Task → Get Status** operation with the returned request ID to poll for results, or provide a webhook URL to receive results automatically.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Dreem documentation](https://docs.dreem.ai)

## Version history

- **0.1.0** — Initial release with model shot generation, product shot generation, library browsing, and task status tracking.
