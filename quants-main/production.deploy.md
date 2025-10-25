# Production Deployment Guide for Quants Café

This guide provides step-by-step instructions for deploying the Quants Café application to a production server using Docker.

## Prerequisites

1.  A server (e.g., a DigitalOcean Droplet, AWS EC2 instance) running a recent version of Linux (e.g., Ubuntu 22.04).
2.  **Docker** installed on the server.
3.  A domain name (`quants.sliplane.app/` in this guide) pointing to your server's IP address.
4.  **Nginx** installed on the server to act as a reverse proxy.

---

## Step 1: Clone the Repository

Connect to your server via SSH and clone the project repository.

```bash
git clone <your-repository-url>
cd quants-café---an-ai-socialfi-simulation
```

---

## Step 2: Set Up Environment Variables

Create a production environment file. This file will securely store your API keys and database URI and will be injected into the Docker container at runtime.

**Never commit this file to Git.**

```bash
nano .env.production
```

Add the following required variables to the file:

```env
# The port the Node.js server will run on inside the container
PORT=3001

# Your MongoDB Atlas connection string
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster-url>/...&appName=..."

# Your Gemini API Key (used for MCP agents and brainstorming)
GEMINI_API_KEY="your_gemini_api_key_here"

# Your Solscan API Key
SOLSCAN_API_KEY="your_solscan_api_key_here"
```

Save and close the file (`Ctrl+X`, then `Y`, then `Enter` in nano).

---

## Step 3: Build the Docker Image

From the root of the project directory, build the Docker image. This command executes the steps in the `Dockerfile`, creating a self-contained, optimized image for your application.

```bash
docker build -t quants-cafe .
```

-   `-t quants-cafe` tags the image with the name `quants-cafe` for easy reference.

---

## Step 4: Run the Docker Container

Run the application inside a Docker container.

```bash
docker run -d --restart always -p 3001:3001 --env-file .env.production --name quants-cafe-container quants-cafe
```

Let's break down this command:
-   `-d`: Runs the container in "detached" mode (in the background).
-   `--restart always`: Ensures the container automatically restarts if it crashes or the server reboots.
-   `-p 3001:3001`: Maps port 3001 on the host server to port 3001 inside the container.
-   `--env-file .env.production`: Injects the environment variables from your file into the container.
-   `--name quants-cafe-container`: Gives the running container a memorable name.
-   `quants-cafe`: The name of the image to run.

Your application is now running! You can check its logs with:
`docker logs -f quants-cafe-container`

---

## Step 5: Set Up Nginx as a Reverse Proxy

Use Nginx to handle incoming traffic on the standard web ports (80 for HTTP, 443 for HTTPS) and correctly proxy WebSocket connections.

1.  **Create an Nginx configuration file:**
    ```bash
    sudo nano /etc/nginx/sites-available/quants-cafe
    ```

2.  **Paste the following configuration.** Replace `quants.sliplane.app/` with your actual domain name. **The `Upgrade` and `Connection` headers are essential for WebSockets.**

    ```nginx
    server {
        listen 80;
        server_name quants.sliplane.app/;

        location / {
            proxy_pass http://localhost:3001;
            proxy_http_version 1.1;
            
            # WebSocket proxy headers
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
    *Note: For a production HTTPS setup, use Certbot to obtain an SSL certificate and configure Nginx accordingly.*

3.  **Enable the site and restart Nginx:**
    ```bash
    sudo ln -s /etc/nginx/sites-available/quants-cafe /etc/nginx/sites-enabled/
    sudo nginx -t  # Test for syntax errors
    sudo systemctl restart nginx
    ```

Your application should now be accessible at `http://quants.sliplane.app/`.
