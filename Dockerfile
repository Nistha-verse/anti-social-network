FROM node:24-bookworm AS frontend-build

WORKDIR /workspace/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --ignore-scripts
COPY app/ ./
RUN npm run build

FROM node:24-bookworm-slim

WORKDIR /workspace/app
ENV NODE_ENV=production
COPY --from=frontend-build /workspace/app/package.json /workspace/app/package-lock.json ./
COPY --from=frontend-build /workspace/app/node_modules ./node_modules
COPY --from=frontend-build /workspace/app/dist ./dist

EXPOSE 4173
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
