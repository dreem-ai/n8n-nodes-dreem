FROM n8nio/n8n:latest

USER root

COPY package.json /opt/custom-nodes/
COPY dist/ /opt/custom-nodes/dist/

RUN cd /usr/local/lib/node_modules/n8n && \
    npm install /opt/custom-nodes

USER node
