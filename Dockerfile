# Build com contexto na raiz da pasta do projeto: docker build -t varal-r5h .
FROM node:22-alpine
WORKDIR /app/servidor
COPY servidor/package.json ./
RUN npm install --omit=dev
COPY servidor/*.js ./
COPY site_online/ /app/site_online/
ENV PORT=3000
EXPOSE 3000
CMD ["npm","start"]
