# Self-hosted GitLab Secrets Box

A secure secrets management solution for self-hosted GitLab CI/CD pipelines that eliminates the need to store sensitive data in CI/CD variables.

## Overview

This project provides a secure API endpoint that delivers secrets to GitLab CI jobs using OpenID Connect (OIDC) authentication. Instead of storing secrets in GitLab CI/CD variables, this solution offers a more secure approach by validating JWT tokens from GitLab runners and serving secrets on-demand.

## ⚠️ Prerequisites

- Self-hosted GitLab instance
- GitLab CI jobs that require access to secrets
- A VPS or server accessible by your GitLab runners
- A domain name with SSL certificate (or Let's Encrypt support)
- Docker and Docker Compose installed on your server

## 🔑 Security Features

- **OIDC Authentication**: Validates JWT tokens from GitLab runners
- **Project Isolation**: Secrets are organized by project ID and branch
- **API Token Protection**: Additional security layer with configurable API tokens
- **JWT Verification**: Uses GitLab's public keys to verify token authenticity

## Installation

### 1. Clone and Configure

```bash
git clone https://github.com/stouch/self-hosted-gitlab-ci-jobs-secrets-box.git
cd self-hosted-gitlab-ci-jobs-secrets-box
```

### 2. Environment Setup

Create a `.env` file based on `.env.sample`:

```bash
cp .env.sample .env
# Edit .env with your configuration
```

### 3. DNS Configuration

Configure your domain's DNS to point to your VPS (e.g., `secrets.yourdomain.com`).

### 4. Secrets Organization

Create your secrets files in the `./secrets` directory structure:

```
secrets/
├── 123/                    # Project ID
│   ├── secrets.json        # Default secrets for all branches
│   ├── main/
│   │   └── secrets.json    # Branch-specific secrets
│   └── develop/
│       └── secrets.json    # Branch-specific secrets
└── 456/                    # Another project
    └── secrets.json
```

### 5. Deployment

```bash
# Create Docker network if it doesn't exist
docker network create web

# Start the service
docker compose up -d
```

## Usage

### GitLab CI Configuration

Add the following to your `.gitlab-ci.yml`:

```yaml
variables:
  GIT_STRATEGY: none

some_job:
  image: your-image:latest
  id_tokens:
    JOB_ID_TOKEN:
      aud: "https://git.yourdomain.com"  # Must match your .env `aud` configuration
  script:
    # Fetch and load secrets
    - |
      eval "$(curl -s -X POST \
        https://secrets.yourdomain.com/secrets?apitk=$SECRETS_API_TOKEN \
        -H "Content-Type: application/json" \
        -H "Accept: text/plain" \
        -d "{\"id_token\": \"$JOB_ID_TOKEN\", \"project_id\": \"$CI_PROJECT_ID\", \"branch_ref\": \"$CI_COMMIT_REF_NAME\"}")"
    
    # If you want project-global variables (and not branch variables), remove `"branch_ref"` property from the above curl payload.

    # Your secrets are now available as environment variables
    - echo "Database URL: $DATABASE_URL"
    - echo "API Key: $API_KEY"
```

### Required CI/CD Variables

In your GitLab project, create a CI/CD variable:
- **Name**: `SECRETS_API_TOKEN`
- **Value**: The API token configured in your `.env` file
- **Type**: Variable
- **Protected**: Yes (recommended)
- **Masked**: Yes (recommended)

## How It Works

1. **Token Generation**: GitLab generates a JWT token for each CI job using the `id_tokens` configuration
2. **Request Validation**: The secrets API validates the JWT token using your self-hosted GitLab's public keys
3. **Audience Verification**: The API verifies the token's audience (`aud`) matches your configuration
4. **Secrets Retrieval**: Upon successful validation, secrets are returned for the specific project and branch
5. **Environment Loading**: The CI job loads the secrets as environment variables

### Security Flow

```
GitLab Runner → JWT Token → Secrets API → Token Validation → Secrets Response
     ↓              ↓            ↓              ↓              ↓
  CI Job      OIDC Token    Public Key    GitLab Keys    Environment
```

## Development

### Local Development Setup

```bash
# Install dependencies
npm ci

# Build the project
npm run build

# Start the development server
npm run start
```

### Production Deployment (without Docker)

For production deployment, use a reverse proxy (nginx, Traefik, etc.) to handle SSL termination and forward requests to the Node.js application.

## Configuration

### Environment Variables

Key configuration options in `.env`:

- `ISSUER_URL`: Your GitLab instance URL
- `EXPECTED_AUDIENCE`: Expected audience in JWT tokens
- `API_TOKEN`: Security token for API access
- `PORT`: Application port (default: 3000)

### Secrets File Format

Secrets files should be JSON format:

```json
{
  "DATABASE_URL": "postgresql://user:pass@host:5432/db",
  "API_KEY": "your-api-key-here",
  "REDIS_URL": "redis://localhost:6379"
}
```

## Troubleshooting

### Common Issues

1. **JWT Validation Failed**: Ensure `ISSUER_URL` and `EXPECTED_AUDIENCE` match your GitLab configuration
2. **Secrets Not Found**: Verify the project ID and branch structure in the `secrets/` directory
3. **Network Connectivity**: Ensure GitLab runners can reach your secrets API endpoint

### Logs

Check Docker logs for debugging:

```bash
docker compose logs -f
```

## Security Considerations

- Keep your `.env` file secure and never commit it to version control
- Use HTTPS in production with valid SSL certificates
- Regularly rotate API tokens
- Monitor access logs for suspicious activity
- Consider implementing rate limiting for additional security

