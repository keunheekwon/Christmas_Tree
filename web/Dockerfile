FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN test -f public/scene.bin && npm run build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve@14.2.4 && npm cache clean --force
COPY --from=build /app/dist ./dist
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT} --no-port-switching"]
