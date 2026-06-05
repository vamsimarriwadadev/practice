# infrastructure/terraform/modules/lambda/variables.tf

variable "function_name" {
  description = "Name of the Lambda function"
  type        = string
}

variable "source_dir" {
  description = "Absolute path to the folder containing handler.py"
  type        = string
}

variable "runtime" {
  description = "Lambda runtime identifier"
  type        = string
  default     = "python3.12"
}

variable "timeout" {
  description = "Function timeout in seconds"
  type        = number
  default     = 30
}

variable "memory_size" {
  description = "Amount of memory in MB"
  type        = number
  default     = 128
}

variable "environment_variables" {
  description = "Environment variables injected into the Lambda runtime"
  type        = map(string)
  default     = {}
}

variable "extra_policy_arns" {
  description = "Additional IAM policy ARNs to attach to the Lambda role"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}
