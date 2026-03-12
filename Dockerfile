FROM n8nio/n8n:latest

USER root

# Use /opt/custom-nodes instead of ~/.n8n/custom to avoid being
# shadowed by the n8n_data Docker volume mounted at ~/.n8n
RUN mkdir -p /opt/custom-nodes
COPY package.json /opt/custom-nodes/
COPY dist/ /opt/custom-nodes/dist/
# Skipped: no runtime dependencies, n8n-workflow peer dep is provided by the n8n host
# RUN cd /opt/custom-nodes && npm install --omit=dev
RUN chown -R node:node /opt/custom-nodes

USER node

ENV N8N_CUSTOM_EXTENSIONS=/opt/custom-nodes
