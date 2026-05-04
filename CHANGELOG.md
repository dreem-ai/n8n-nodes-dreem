# Changelog

All notable changes to `n8n-nodes-dreem` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

### Added

- Initial release of the Dreem n8n community node.
- **Generative Content** operations:
  - Generate Model Shots — try a product on AI models with selectable shots, with support for back and styling images.
  - Generate Product Shots — clean studio-style product photography from a source image.
  - Generate Video — animate a product image into a 5s or 10s video at 1:1, 3:4, or 9:16 aspect ratio, with optional motion prompts.
- **Library** operations:
  - Get Available Talents — list AI models, with gender and keyword filters.
  - Get Available Shots — list available shots, with shot-type and keyword filters.
  - Get Video Prompts — browse video animation prompts with gender, keyword, and pagination support.
- **Task** operations:
  - Get Status — poll generation task status by request ID.
- Configurable output format (PNG/JPEG), aspect ratio, and optional webhook callback URL for asynchronous results.
- Two authentication methods:
  - **OAuth2** — PKCE flow with selectable permission scopes (Full Access, Generation Only, Read Only, Custom).
  - **API Key** — Dreem-issued personal API keys (prefix `dreem_pk_`).
