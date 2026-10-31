FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Copy all source files
COPY . .

# Bundle scripts into index.html
RUN node bundle.js

# Expose default port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
