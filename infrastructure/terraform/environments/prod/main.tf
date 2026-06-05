# infrastructure/terraform/environments/prod/main.tf
#
# Prod environment — points at real AWS.
# Credentials come from environment variables or ~/.aws/credentials.
# Run:  terraform init && terraform apply

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment when you have a real S3 bucket for state:
  # backend "s3" {
  #   bucket = "your-tf-state-bucket"
  #   key    = "practice-lambdas/prod/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = "us-east-1"
  # Credentials via AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars
}

locals {
  env  = "prod"
  root = "${path.module}/../../../.."

  common_tags = {
    environment = local.env
    managed_by  = "terraform"
    project     = "practice-lambdas"
  }
}

module "hello_world" {
  source = "../../modules/lambda"

  function_name = "${local.env}-hello-world"
  source_dir    = "${local.root}/functions/hello-world"
  runtime       = "python3.12"
  timeout       = 10
  memory_size   = 128
  tags          = local.common_tags
}

module "s3_processor" {
  source = "../../modules/lambda"

  function_name = "${local.env}-s3-processor"
  source_dir    = "${local.root}/functions/s3-processor"
  runtime       = "python3.12"
  timeout       = 30
  memory_size   = 256
  tags          = local.common_tags
}

module "sqs_consumer" {
  source = "../../modules/lambda"

  function_name = "${local.env}-sqs-consumer"
  source_dir    = "${local.root}/functions/sqs-consumer"
  runtime       = "python3.12"
  timeout       = 30
  memory_size   = 128
  tags          = local.common_tags
}

resource "aws_sqs_queue" "demo" {
  name = "${local.env}-demo-queue"
  tags = local.common_tags
}

resource "aws_s3_bucket" "uploads" {
  bucket = "${local.env}-uploads-bucket"
  tags   = local.common_tags
}
