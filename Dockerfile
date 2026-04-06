# 1. Base image (Node installed already)
FROM node:24-alpine

# 2. Set working directory inside container
WORKDIR /app

# 3. Copy dependency files first
COPY package*.json ./

# 4. Install dependencies
RUN npm ci --omit=dev

# 5. Copy remaining project files
COPY . .

# 6. Expose port (your app port)
# EXPOSE 3000-- as this is a tg bot code it doesnot run on any port.

# 7. Command to start app
CMD ["node", "music_bot.js"]