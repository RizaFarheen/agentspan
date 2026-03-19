# Self-Hosting Agentspan on Kubernetes

The root `Dockerfile` builds a single image containing both the server and the UI. Spring Boot automatically serves the compiled UI from `/` and the REST API from `/api`. No separate UI container is needed.

---

## Architecture

```
                     ┌──────────────────────────────────────────┐
                     │         Kubernetes Cluster               │
                     │         namespace: agentspan             │
Internet ──► DNS ──► LoadBalancer ──► Ingress (nginx) ──► agentspan-server:8080
                     │                                          │
                     │   agentspan-server (3 replicas, HPA 3–10)│
                     │   ┌──────────────────────────────────┐   │
                     │   │  Spring Boot (port 8080)         │   │
                     │   │  /api/**   → REST API            │   │
                     │   │  /**       → React UI (static)   │   │
                     │   └──────────────────────────────────┘   │
                     │           │                               │
                     │   agentspan-postgres (StatefulSet)        │
                     └──────────────────────────────────────────┘
```

**Components:**

| Component | Image | Replicas |
|---|---|---|
| Server + UI | `agentspan/server:latest` | 3 (auto-scales to 10) |
| PostgreSQL | `postgres:16-alpine` | 1 (StatefulSet + PVC) |

---

## Prerequisites

| Tool | Purpose |
|---|---|
| `kubectl` | Apply manifests |
| `docker` | Build the combined image |
| Kubernetes cluster | EKS, GKE, AKS, k3s, or any CNCF-conformant cluster |
| Ingress-nginx | Load balancer controller |
| (Optional) cert-manager | Automatic TLS certificates |
| (Optional) metrics-server | Required for HPA auto-scaling |

### Install ingress-nginx

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/cloud/deploy.yaml

# Wait for the external IP (~60s on cloud providers)
kubectl get svc -n ingress-nginx ingress-nginx-controller --watch
```

### Install cert-manager (for TLS — recommended)

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
```

### Install metrics-server (for HPA)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

---

## Quick Start

### 1. Configure secrets

Edit `deployment/k8s/secret.yaml`. Set at minimum the PostgreSQL password and at least one LLM API key:

```yaml
POSTGRES_PASSWORD: "your-strong-password"   # ← required
ANTHROPIC_API_KEY: "sk-ant-..."             # ← at least one LLM key
```

> **Never commit `secret.yaml` with real values.** Use [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) or a cloud secrets manager in production.

### 2. Set your domain

Edit `deployment/k8s/ingress.yaml` and replace `agentspan.example.com` with your domain.

### 3. Deploy

```bash
# Build image, push, apply all manifests
./deployment/deploy.sh

# Custom image tag (e.g. for a private registry)
./deployment/deploy.sh --image registry.example.com/agentspan/server:v1.2.0

# Skip Docker build if image already exists
./deployment/deploy.sh --skip-build

# Target a specific k8s context
./deployment/deploy.sh --context my-cluster-context
```

### 4. Access

```bash
kubectl get ingress -n agentspan
```

Point your DNS A record to the ingress load balancer IP and open `http://your-domain`.

---

## Building the Image Manually

```bash
# Build context must be repo root so both ui/ and server/ are accessible
docker build -f server/Dockerfile -t agentspan/server:latest .

# Push to your registry
docker push agentspan/server:latest
```

`server/Dockerfile` runs three stages:
1. **ui-builder** — `pnpm build` → `ui/dist/`
2. **builder** — copies `ui/dist/` into `server/src/main/resources/static/`, then runs `./gradlew bootJar`
3. **runtime** — copies the JAR into a slim JRE image

---

## Manual Step-by-Step Deployment

```bash
# 1. Namespace
kubectl apply -f deployment/k8s/namespace.yaml

# 2. Config + Secrets
kubectl apply -f deployment/k8s/configmap.yaml
kubectl apply -f deployment/k8s/secret.yaml

# 3. PostgreSQL
kubectl apply -f deployment/k8s/postgres.yaml
kubectl rollout status statefulset/agentspan-postgres -n agentspan

# 4. Server (includes UI)
kubectl apply -f deployment/k8s/server.yaml
kubectl rollout status deployment/agentspan-server -n agentspan

# 5. Ingress
kubectl apply -f deployment/k8s/ingress.yaml

# 6. HPA (auto-scaling)
kubectl apply -f deployment/k8s/hpa.yaml
```

---

## Configuration

### ConfigMap (`deployment/k8s/configmap.yaml`)

| Key | Default | Description |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `postgres` | Must be `postgres` for k8s |
| `POSTGRES_HOST` | `agentspan-postgres` | PostgreSQL service name |
| `POSTGRES_DB` | `agentspan` | Database name |
| `JAVA_OPTS` | `-Xms512m -Xmx1536m ...` | JVM heap settings |
| `OLLAMA_HOST` | _(unset)_ | Set if using local Ollama models |

### Secrets (`deployment/k8s/secret.yaml`)

| Key | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | Yes | DB password |
| `ANTHROPIC_API_KEY` | At least one | Claude models |
| `OPENAI_API_KEY` | At least one | GPT / o-series models |
| `GEMINI_API_KEY` | — | Google Gemini |
| `AZURE_OPENAI_*` | — | Azure OpenAI |
| `AWS_ACCESS_KEY_ID` / `SECRET` | — | AWS Bedrock |
| `GOOGLE_CLOUD_PROJECT` | — | Vertex AI |

---

## TLS / HTTPS

1. Create a ClusterIssuer:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: you@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

2. Uncomment in `deployment/k8s/ingress.yaml`:

```yaml
annotations:
  cert-manager.io/cluster-issuer: "letsencrypt-prod"
...
tls:
  - hosts:
      - agentspan.example.com
    secretName: agentspan-tls
```

---

## Cloud-Specific Notes

**AWS EKS** — uncomment `storageClassName: gp3` in `postgres.yaml`

**GKE** — default `standard` storage class works as-is

**AKS** — uncomment `storageClassName: managed-premium` in `postgres.yaml`

For production PostgreSQL HA, use [CloudNativePG](https://cloudnative-pg.io/) or a managed service (RDS, Cloud SQL, Azure Database for PostgreSQL).

---

## Useful Commands

```bash
# Check pods
kubectl get pods -n agentspan

# Tail server logs
kubectl logs -f deployment/agentspan-server -n agentspan

# Restart to pick up new image
kubectl rollout restart deployment/agentspan-server -n agentspan

# Port-forward for local debugging
kubectl port-forward svc/agentspan-server 8080:8080 -n agentspan

# Scale manually
kubectl scale deployment/agentspan-server --replicas=5 -n agentspan

# Tear down everything
kubectl delete namespace agentspan
```

---

## File Overview

```
server/Dockerfile               Builds UI + server into one image (build context: repo root)
deployment/
├── README.md                   This file
├── deploy.sh                   One-shot deployment script
└── k8s/
    ├── namespace.yaml           Namespace: agentspan
    ├── configmap.yaml           Non-secret runtime config
    ├── secret.yaml              Secrets template (edit before applying)
    ├── postgres.yaml            PostgreSQL StatefulSet + Service + 20Gi PVC
    ├── server.yaml              Server Deployment (3 replicas) + Service + PDB
    ├── ingress.yaml             nginx Ingress: all traffic → server:8080
    └── hpa.yaml                 HPA: auto-scale 3–10 replicas on CPU/memory
```
