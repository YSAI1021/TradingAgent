FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# Run Vite dev server in the container (for local development via docker compose)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

