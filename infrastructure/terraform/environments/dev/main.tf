# infrastructure/terraform/environments/dev/main.tf
#
# Dev environment — points at Floci (http://localhost:4566).
# Run:  terraform init && terraform apply

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ── Provider — Floci endpoint ─────────────────────────────────────────────────

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    lambda = "http://localhost:4566"
    iam    = "http://localhost:4566"
    s3     = "http://localhost:4566"
    sqs    = "http://localhost:4566"
  }
}

locals {
  env  = "dev"
  # Repo root — two levels up from this file
  root = "${path.module}/../../../.."

  common_tags = {
    environment = local.env
    managed_by  = "terraform"
    project     = "practice-lambdas"
  }
}

# ── hello-world ───────────────────────────────────────────────────────────────

module "hello_world" {
  source = "../../modules/lambda"

  function_name = "${local.env}-hello-world"
  source_dir    = "${local.root}/functions/hello-world"
  runtime       = "python3.12"
  timeout       = 10
  memory_size   = 128
  tags          = local.common_tags
}

# ── s3-processor ──────────────────────────────────────────────────────────────

module "s3_processor" {
  source = "../../modules/lambda"

  function_name = "${local.env}-s3-processor"
  source_dir    = "${local.root}/functions/s3-processor"
  runtime       = "python3.12"
  timeout       = 30
  memory_size   = 256

  environment_variables = {
    AWS_ENDPOINT_URL    = "http://localhost:4566"
    AWS_DEFAULT_REGION  = "us-east-1"
  }

  tags = local.common_tags
}

# ── sqs-consumer ──────────────────────────────────────────────────────────────

module "sqs_consumer" {
  source = "../../modules/lambda"

  function_name = "${local.env}-sqs-consumer"
  source_dir    = "${local.root}/functions/sqs-consumer"
  runtime       = "python3.12"
  timeout       = 30
  memory_size   = 128
  tags          = local.common_tags
}

# ── SQS Queue (for sqs-consumer trigger) ─────────────────────────────────────

resource "aws_sqs_queue" "demo" {
  name = "${local.env}-demo-queue"
  tags = local.common_tags
}

# ── S3 Bucket (for s3-processor trigger) ─────────────────────────────────────

resource "aws_s3_bucket" "uploads" {
  bucket = "${local.env}-uploads-bucket"
  tags   = local.common_tags
}
