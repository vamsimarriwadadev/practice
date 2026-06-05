# practice-lambdas

AWS Lambda functions for local development and CI/CD learning using **Floci** (free LocalStack alternative).

## Project Structure

```
practice-lambdas/
├── functions/
│   ├── hello-world/        ← basic Lambda, great starting point
│   ├── s3-processor/       ← triggered by S3 upload events
│   └── sqs-consumer/       ← processes SQS message batches
├── infrastructure/
│   └── terraform/
│       ├── modules/lambda/ ← reusable module (1 call = 1 Lambda deployed)
│       └── environments/
│           ├── dev/        ← points at Floci (localhost:4566)
│           └── prod/       ← points at real AWS
├── tests/                  ← pytest integration tests
├── docker/                 ← Floci docker-compose
└── .github/workflows/      ← GitHub Actions CI/CD pipeline
```

## Quick Start (local)

**1. Start Floci**
```bash
docker compose -f docker/docker-compose.yaml up -d
```

**2. Deploy all Lambdas via Terraform**
```bash
cd infrastructure/terraform/environments/dev
terraform init
terraform apply -auto-approve
```

**3. Run tests**
```bash
pip install boto3 pytest
pytest tests/ -v
```

**4. Invoke a function manually**
```bash
aws lambda invoke \
  --endpoint-url http://localhost:4566 \
  --function-name dev-hello-world \
  --payload '{"name":"Vamsi"}' \
  --cli-binary-format raw-in-base64-out \
  output.json && cat output.json
```

**5. Cleanup**
```bash
terraform destroy -auto-approve
docker compose -f docker/docker-compose.yaml down
```

## CI/CD with Self-Hosted Runner

1. Go to GitHub → Settings → Actions → Runners → New self-hosted runner
2. Follow the instructions to register your PC as a runner
3. Push to `main` — the pipeline runs on your machine automatically

The pipeline does: **lint → terraform plan → terraform apply → pytest → terraform destroy → stop Floci**

## Lambda Functions

| Function | Trigger | Purpose |
|---|---|---|
| `hello-world` | Direct invoke | Learn Lambda basics |
| `s3-processor` | S3 event | Process uploaded file metadata |
| `sqs-consumer` | SQS batch | Process message queues reliably |

## What You Learn

- GitHub Actions workflow syntax
- Self-hosted runners (how enterprises run CI on their own infra)
- Terraform modules and reusable IaC patterns
- Lambda packaging, IAM roles, runtimes
- Integration testing with boto3 + pytest
- Event-driven architecture (S3, SQS triggers)
