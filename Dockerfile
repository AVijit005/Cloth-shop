FROM python:3.12-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    default-libmysqlclient-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 for Tailwind build
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Install Tailwind dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci

# Build Tailwind CSS (only needs templates + config + input CSS)
COPY tailwind.config.js postcss.config.js ./
COPY static/css/tailwind-input.css ./static/css/tailwind-input.css
COPY templates ./templates
COPY static/js ./static/js
RUN npm run build:css

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Create required directories
RUN mkdir -p uploads logs

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/health')"

# Production start
CMD ["waitress-serve", "--host=0.0.0.0", "--port=5000", "run:app"]
