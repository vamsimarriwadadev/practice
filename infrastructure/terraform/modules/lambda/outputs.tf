# infrastructure/terraform/modules/lambda/outputs.tf

output "function_name" {
  description = "Name of the deployed Lambda function"
  value       = aws_lambda_function.this.function_name
}

output "function_arn" {
  description = "ARN of the deployed Lambda function"
  value       = aws_lambda_function.this.arn
}

output "invoke_arn" {
  description = "Invoke ARN — used by API Gateway integrations"
  value       = aws_lambda_function.this.invoke_arn
}

output "role_arn" {
  description = "ARN of the IAM role attached to this function"
  value       = aws_iam_role.this.arn
}
