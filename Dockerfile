FROM node:20-alpine

ENV NODE_ENV=production
ENV PORT=10000

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --chown=node:node . .

USER node

EXPOSE 10000

CMD ["npm", "start"]
