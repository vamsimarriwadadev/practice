# infrastructure/terraform/modules/lambda/main.tf
#
# Reusable module — call this once per Lambda function.
# Handles: zip packaging, IAM role, and the aws_lambda_function resource.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ── Zip the handler source ────────────────────────────────────────────────────

data "archive_file" "zip" {
  type        = "zip"
  source_file = "${var.source_dir}/handler.py"
  output_path = "${path.module}/builds/${var.function_name}.zip"
}

# ── IAM role (one per function for least-privilege) ───────────────────────────

resource "aws_iam_role" "this" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRole"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })

  tags = var.tags
}

# Basic execution policy — allows Lambda to write CloudWatch logs
resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Optional extra policies passed in by the caller (e.g. S3 read, SQS receive)
resource "aws_iam_role_policy_attachment" "extra" {
  for_each   = toset(var.extra_policy_arns)
  role       = aws_iam_role.this.name
  policy_arn = each.value
}

# ── Lambda function ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "this" {
  function_name    = var.function_name
  filename         = data.archive_file.zip.output_path
  source_code_hash = data.archive_file.zip.output_base64sha256
  role             = aws_iam_role.this.arn
  handler          = "handler.handler"
  runtime          = var.runtime
  timeout          = var.timeout
  memory_size      = var.memory_size

  environment {
    variables = var.environment_variables
  }

  tags = var.tags
}
