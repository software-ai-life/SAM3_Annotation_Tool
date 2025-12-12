# SAM3 Annotation Tool - Docker Image
FROM nvidia/cuda:12.6.0-runtime-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN apt update \
    && apt install ca-certificates -y \
    && apt clean all \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt


RUN apt-get update && apt-get install -y \
    build-essential \
    wget curl git vim \
    xz-utils \
    libssl-dev zlib1g-dev libbz2-dev libreadline-dev \
    libsqlite3-dev libncursesw5-dev libffi-dev liblzma-dev

# Install Node.js 20 (binary install)
RUN cd /tmp && \    
    curl -LO https://nodejs.org/dist/v20.14.0/node-v20.14.0-linux-x64.tar.xz && \
    tar -xf node-v20.14.0-linux-x64.tar.xz && \
    mv node-v20.14.0-linux-x64 /usr/local/node20 && \
    ln -s /usr/local/node20/bin/node /usr/bin/node && \
    ln -s /usr/local/node20/bin/npm /usr/bin/npm && \
    ln -s /usr/local/node20/bin/npx /usr/bin/npx && \
    rm -f node-v20.14.0-linux-x64.tar.xz


# Install build deps for Python 3.12
RUN apt-get update && apt-get install -y \
    build-essential \
    wget \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncursesw5-dev \
    libffi-dev \
    liblzma-dev

# Build Python 3.12 from source
RUN cd /tmp && \
    wget https://www.python.org/ftp/python/3.12.7/Python-3.12.7.tgz && \
    tar -xzf Python-3.12.7.tgz && \
    cd Python-3.12.7 && \
    ./configure --enable-optimizations && \
    make -j4 && \
    make install && \
    cd .. && rm -rf Python-3.12.7 Python-3.12.7.tgz

# Ensure python3.12 is default
RUN ln -sf /usr/local/bin/python3.12 /usr/bin/python3 && \
    ln -sf /usr/local/bin/pip3.12 /usr/bin/pip3
    

# Create app directory
WORKDIR /app

# Install PyTorch with CUDA 12.6 support (required by SAM3)
RUN pip3 install --no-cache-dir torch==2.7.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126 --trusted-host download.pytorch.org

# Copy backend files
COPY backend/ ./backend/

# Install Python dependencies
RUN pip3 install --no-cache-dir -r backend/requirements.txt

# Clone and install SAM3
RUN cd /app/backend/sam3 && pip3 install -e .

# Copy frontend files
COPY frontend/ ./frontend/

# Install frontend dependencies and build
RUN cd frontend && npm install && npm run build

# Copy built frontend to serve statically
RUN mkdir -p /app/backend/static \
    && cp -r /app/frontend/dist/* /app/backend/static/

# Expose port
EXPOSE 5341

# Set working directory to backend
WORKDIR /app/backend

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5341", "--reload"]
