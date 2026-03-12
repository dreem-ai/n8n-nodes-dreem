FROM n8nio/n8n:latest

USER root

RUN mkdir -p /home/node/.n8n/custom
COPY package.json /home/node/.n8n/custom/
COPY dist/ /home/node/.n8n/custom/dist/
# Skipped: no runtime dependencies, n8n-workflow peer dep is provided by the n8n host
# RUN cd /home/node/.n8n/custom && npm install --omit=dev
RUN chown -R node:node /home/node/.n8n/custom

USER node

ENV N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom
