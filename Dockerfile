# Gunakan image Node.js sebagai base
FROM node:20

# Set direktori kerja di dalam container
WORKDIR /app

# Copy file package.json dan package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy seluruh project ke container
COPY . .

# Buat direktori upload & sessions
RUN mkdir -p sessions uploads

# Jalankan app
CMD ["node", "index.js"]

# Aplikasi akan berjalan di port 3000
EXPOSE 3001
