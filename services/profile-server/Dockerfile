FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Client generation needs a syntactically valid URL, but never connects to a DB.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start"]
